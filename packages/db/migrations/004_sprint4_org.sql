-- Migration: 004_sprint4_org
-- Sprint 4: Org hierarchy (departments + manager reporting chain)
-- Also adds goal_templates for manager-driven goal assignment.

-- ============================================================
-- Departments
-- ============================================================
CREATE TABLE departments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

-- ============================================================
-- Extend workspace_members with manager chain
-- ============================================================

-- manager_id: who this member reports to (must be in same workspace)
ALTER TABLE workspace_members
  ADD COLUMN manager_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Link member to a department by ID instead of free-text
ALTER TABLE workspace_members
  ADD COLUMN department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

-- ============================================================
-- Goal templates (manager-created, assigned to members)
-- ============================================================
CREATE TABLE goal_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by   UUID        NOT NULL REFERENCES users(id),
  title        TEXT        NOT NULL,
  description  TEXT,
  category     TEXT        NOT NULL CHECK (category IN ('health','work','learning','finance','other')),
  numeric_target NUMERIC   NOT NULL CHECK (numeric_target > 0),
  unit         TEXT        NOT NULL,
  cadence      TEXT        NOT NULL CHECK (cadence IN ('daily', 'weekly')),
  is_mandatory BOOLEAN     NOT NULL DEFAULT false,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- User deletion queue (GDPR hard-delete scheduling)
-- ============================================================
CREATE TABLE user_deletion_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  execute_after TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',
  executed_at   TIMESTAMPTZ
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX departments_workspace    ON departments(workspace_id);
CREATE INDEX goal_templates_workspace ON goal_templates(workspace_id);
CREATE INDEX workspace_members_mgr    ON workspace_members(manager_id) WHERE manager_id IS NOT NULL;
CREATE INDEX workspace_members_dept   ON workspace_members(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX deletion_queue_execute   ON user_deletion_queue(execute_after) WHERE executed_at IS NULL;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE departments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_deletion_queue ENABLE ROW LEVEL SECURITY;

-- departments: visible to workspace members
CREATE POLICY departments_select ON departments FOR SELECT USING (
  current_setting('app.current_user_id', true) IS NULL
  OR current_setting('app.current_user_id', true) = ''
  OR workspace_id IN (SELECT current_user_workspace_ids())
);
CREATE POLICY departments_insert ON departments FOR INSERT WITH CHECK (true);
CREATE POLICY departments_update ON departments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY departments_delete ON departments FOR DELETE USING (true);

-- goal_templates: visible to workspace members
CREATE POLICY goal_templates_select ON goal_templates FOR SELECT USING (
  current_setting('app.current_user_id', true) IS NULL
  OR current_setting('app.current_user_id', true) = ''
  OR workspace_id IN (SELECT current_user_workspace_ids())
);
CREATE POLICY goal_templates_insert ON goal_templates FOR INSERT WITH CHECK (true);
CREATE POLICY goal_templates_update ON goal_templates FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY goal_templates_delete ON goal_templates FOR DELETE USING (true);

-- user_deletion_queue: only owner themselves (or service mode)
CREATE POLICY deletion_queue_select ON user_deletion_queue FOR SELECT USING (
  current_setting('app.current_user_id', true) IS NULL
  OR current_setting('app.current_user_id', true) = ''
  OR user_id = current_setting('app.current_user_id', true)::uuid
);
CREATE POLICY deletion_queue_insert ON user_deletion_queue FOR INSERT WITH CHECK (true);
CREATE POLICY deletion_queue_update ON user_deletion_queue FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY deletion_queue_delete ON user_deletion_queue FOR DELETE USING (true);

-- ============================================================
-- Grants
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON departments         TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON goal_templates      TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_deletion_queue TO app_user;
