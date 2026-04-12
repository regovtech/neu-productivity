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

-- App role: created with: CREATE ROLE app_user NOLOGIN;
-- The API server connects as a superuser and sets app.current_user_id
-- before handing off to the RLS-protected app_user role (or via SET LOCAL).

ALTER TABLE workspaces       ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_tokens     ENABLE ROW LEVEL SECURITY;

-- Helper: is the current session user a member of a given workspace?
CREATE OR REPLACE FUNCTION current_user_workspace_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT workspace_id FROM workspace_members
  WHERE user_id = current_setting('app.current_user_id', true)::uuid
$$;

-- Workspaces: visible if the session user is a member
CREATE POLICY workspaces_member ON workspaces
  FOR ALL USING (id IN (SELECT current_user_workspace_ids()));

-- Workspace members: visible if in same workspace
CREATE POLICY workspace_members_same_ws ON workspace_members
  FOR ALL USING (workspace_id IN (SELECT current_user_workspace_ids()));

-- Goals: visible if session user owns the goal OR is a member of the workspace
CREATE POLICY goals_workspace_member ON goals
  FOR ALL USING (workspace_id IN (SELECT current_user_workspace_ids()));

-- Check-ins: scoped to workspace
CREATE POLICY check_ins_workspace ON check_ins
  FOR ALL USING (workspace_id IN (SELECT current_user_workspace_ids()));

-- Reminders: own reminders only
CREATE POLICY reminders_own ON reminders
  FOR ALL USING (
    user_id = current_setting('app.current_user_id', true)::uuid
  );

-- Audit events: workspace-scoped (managers can see all in workspace)
CREATE POLICY audit_workspace ON audit_events
  FOR SELECT USING (workspace_id IN (SELECT current_user_workspace_ids()));

-- Invite tokens: visible to workspace admins/owners (read), any user can read their own invite
CREATE POLICY invite_tokens_workspace ON invite_tokens
  FOR SELECT USING (
    workspace_id IN (SELECT current_user_workspace_ids())
    OR email = (SELECT email FROM users WHERE id = current_setting('app.current_user_id', true)::uuid)
  );
