-- Migration: 001_initial
-- Creates the full v1 schema with RLS policies for tenant isolation.

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Workspaces (tenant root)
-- ============================================================
CREATE TABLE workspaces (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT        UNIQUE NOT NULL,
  name          TEXT        NOT NULL,
  kind          TEXT        NOT NULL DEFAULT 'personal' CHECK (kind IN ('personal', 'company')),
  plan          TEXT        NOT NULL DEFAULT 'free'     CHECK (plan IN ('free', 'trial', 'paid')),
  trial_ends_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Users
-- ============================================================
CREATE TABLE users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        UNIQUE NOT NULL,
  display_name  TEXT,
  avatar_url    TEXT,
  password_hash TEXT,  -- null for OAuth-only accounts
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ  -- soft delete; hard delete job fires 30 days after this
);

-- ============================================================
-- Workspace membership (bridges user <-> workspace)
-- ============================================================
CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'manager', 'member')),
  department   TEXT,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- ============================================================
-- Invite tokens (for B2B employee onboarding)
-- ============================================================
CREATE TABLE invite_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invited_by   UUID        NOT NULL REFERENCES users(id),
  email        TEXT        NOT NULL,
  role         TEXT        NOT NULL DEFAULT 'member',
  token        TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  accepted_at  TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Goals
-- ============================================================
CREATE TABLE goals (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id        UUID        NOT NULL REFERENCES users(id),
  assigned_by_user_id  UUID        REFERENCES users(id),  -- null = self-created
  title                TEXT        NOT NULL,
  description          TEXT,
  category             TEXT        NOT NULL CHECK (category IN ('health','work','learning','finance','other')),
  numeric_target       NUMERIC     NOT NULL CHECK (numeric_target > 0),
  unit                 TEXT        NOT NULL,
  cadence              TEXT        NOT NULL CHECK (cadence IN ('daily', 'weekly')),
  target_date          DATE        NOT NULL,
  is_mandatory         BOOLEAN     NOT NULL DEFAULT false,
  status               TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','achieved','abandoned')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Check-ins
-- ============================================================
CREATE TABLE check_ins (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id      UUID        NOT NULL REFERENCES goals(id)      ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES users(id),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id),
  value        NUMERIC     NOT NULL,
  note         TEXT,
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Reminders
-- ============================================================
CREATE TABLE reminders (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id      UUID        NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES users(id),
  channel      TEXT        NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'push')),
  schedule     TEXT        NOT NULL,  -- cron expression e.g. '0 9 * * *'
  enabled      BOOLEAN     NOT NULL DEFAULT true,
  last_fired_at TIMESTAMPTZ
);

-- ============================================================
-- Audit log
-- ============================================================
CREATE TABLE audit_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id),
  actor_user_id UUID        REFERENCES users(id),
  event_type    TEXT        NOT NULL,  -- e.g. 'goal.assigned', 'member.invited'
  target_type   TEXT,
  target_id     UUID,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX goals_workspace_owner    ON goals(workspace_id, owner_user_id);
CREATE INDEX check_ins_goal           ON check_ins(goal_id, checked_at DESC);
CREATE INDEX check_ins_workspace_user ON check_ins(workspace_id, user_id, checked_at DESC);
CREATE INDEX audit_events_workspace   ON audit_events(workspace_id, created_at DESC);
CREATE INDEX invite_tokens_email_ws   ON invite_tokens(email, workspace_id);

-- ============================================================
-- Row-Level Security
-- ============================================================

-- App role: used for read-path queries where RLS should filter rows.
-- Writes go through the same role; INSERT/UPDATE/DELETE are not RLS-restricted
-- (application layer handles write authorization).
-- Create the role if it doesn't already exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user;
  END IF;
END$$;

ALTER TABLE workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_tokens      ENABLE ROW LEVEL SECURITY;

-- Helper: workspaces visible to the current session user.
-- Uses SECURITY DEFINER so it can query workspace_members as the table owner
-- even when called from a restricted role.
CREATE OR REPLACE FUNCTION current_user_workspace_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT workspace_id FROM workspace_members
  WHERE user_id = current_setting('app.current_user_id', true)::uuid
$$;

-- RLS policy design:
--   SELECT  → restricted to the session user's workspaces via app.current_user_id
--   INSERT / UPDATE / DELETE → always permitted for the app role;
--     write authorization is enforced at the application layer before the SQL is issued.
--
-- Multiple permissive policies per command are OR-combined, so a per-command
-- write policy (USING/WITH CHECK true) does not loosen the SELECT restriction.

-- Service-mode vs user-mode RLS pattern:
--   When app.current_user_id is NOT set → service mode, all rows visible.
--     Used for: migrations, seeds, background jobs, and INSERT … RETURNING
--     (PostgreSQL 15 errors when a freshly inserted row is invisible to SELECT).
--   When app.current_user_id IS set    → user mode, workspace-filtered.
--
-- Writes (INSERT / UPDATE / DELETE) are always permitted; the application layer
-- enforces write authorization before issuing SQL.

-- Helper macro: true when operating in service mode (no user context).
-- Inline it per policy so each policy is self-contained.

-- ---- workspaces ----
CREATE POLICY workspaces_select ON workspaces FOR SELECT USING (
  current_setting('app.current_user_id', true) IS NULL
  OR current_setting('app.current_user_id', true) = ''
  OR id IN (SELECT current_user_workspace_ids())
);
CREATE POLICY workspaces_insert ON workspaces FOR INSERT WITH CHECK (true);
CREATE POLICY workspaces_update ON workspaces FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY workspaces_delete ON workspaces FOR DELETE USING (true);

-- ---- workspace_members ----
CREATE POLICY workspace_members_select ON workspace_members FOR SELECT USING (
  current_setting('app.current_user_id', true) IS NULL
  OR current_setting('app.current_user_id', true) = ''
  OR workspace_id IN (SELECT current_user_workspace_ids())
);
CREATE POLICY workspace_members_insert ON workspace_members FOR INSERT WITH CHECK (true);
CREATE POLICY workspace_members_update ON workspace_members FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY workspace_members_delete ON workspace_members FOR DELETE USING (true);

-- ---- users (no RLS — visible globally, app layer controls access) ----
-- No RLS enabled on users; already omitted from ALTER TABLE … ENABLE ROW LEVEL SECURITY above.

-- ---- goals ----
CREATE POLICY goals_select ON goals FOR SELECT USING (
  current_setting('app.current_user_id', true) IS NULL
  OR current_setting('app.current_user_id', true) = ''
  OR workspace_id IN (SELECT current_user_workspace_ids())
);
CREATE POLICY goals_insert ON goals FOR INSERT WITH CHECK (true);
CREATE POLICY goals_update ON goals FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY goals_delete ON goals FOR DELETE USING (true);

-- ---- check_ins ----
CREATE POLICY check_ins_select ON check_ins FOR SELECT USING (
  current_setting('app.current_user_id', true) IS NULL
  OR current_setting('app.current_user_id', true) = ''
  OR workspace_id IN (SELECT current_user_workspace_ids())
);
CREATE POLICY check_ins_insert ON check_ins FOR INSERT WITH CHECK (true);
CREATE POLICY check_ins_update ON check_ins FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY check_ins_delete ON check_ins FOR DELETE USING (true);

-- ---- reminders ----
CREATE POLICY reminders_select ON reminders FOR SELECT USING (
  current_setting('app.current_user_id', true) IS NULL
  OR current_setting('app.current_user_id', true) = ''
  OR user_id = current_setting('app.current_user_id', true)::uuid
);
CREATE POLICY reminders_insert ON reminders FOR INSERT WITH CHECK (true);
CREATE POLICY reminders_update ON reminders FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY reminders_delete ON reminders FOR DELETE USING (true);

-- ---- audit_events ----
CREATE POLICY audit_events_select ON audit_events FOR SELECT USING (
  current_setting('app.current_user_id', true) IS NULL
  OR current_setting('app.current_user_id', true) = ''
  OR workspace_id IN (SELECT current_user_workspace_ids())
);
CREATE POLICY audit_events_insert ON audit_events FOR INSERT WITH CHECK (true);
CREATE POLICY audit_events_update ON audit_events FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY audit_events_delete ON audit_events FOR DELETE USING (true);

-- ---- invite_tokens ----
CREATE POLICY invite_tokens_select ON invite_tokens FOR SELECT USING (
  current_setting('app.current_user_id', true) IS NULL
  OR current_setting('app.current_user_id', true) = ''
  OR workspace_id IN (SELECT current_user_workspace_ids())
  OR email = (SELECT email FROM users WHERE id = current_setting('app.current_user_id', true)::uuid)
);
CREATE POLICY invite_tokens_insert ON invite_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY invite_tokens_update ON invite_tokens FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY invite_tokens_delete ON invite_tokens FOR DELETE USING (true);

-- ============================================================
-- Grants for app_user role
-- ============================================================
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT EXECUTE ON FUNCTION current_user_workspace_ids() TO app_user;
