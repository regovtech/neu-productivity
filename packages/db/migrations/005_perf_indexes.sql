-- Migration: 005_perf_indexes
-- Performance hardening before production:
--   1. Add users.updated_at (referenced in users.completeOnboarding but missing from schema)
--   2. Add workspace_members(user_id) index — critical for RLS function performance
--   3. Add goals(owner_user_id, status) index — dashboard + freemium gate queries
--   4. Add check_ins(user_id, checked_at) index — per-user stats queries
--   5. Add users(deleted_at) partial index — active-user filters

-- ============================================================
-- 1. users.updated_at (was missing from 001_initial)
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: existing rows get created_at as their updated_at
UPDATE users SET updated_at = created_at WHERE updated_at = now() AND created_at < now();

-- ============================================================
-- 2. workspace_members(user_id) — RLS hot path
-- ============================================================
-- The current_user_workspace_ids() SECURITY DEFINER function runs:
--   SELECT workspace_id FROM workspace_members WHERE user_id = ?
-- on every RLS policy check. The existing PRIMARY KEY is (workspace_id, user_id),
-- which can't serve user_id-only lookups efficiently.
CREATE INDEX IF NOT EXISTS workspace_members_user
  ON workspace_members(user_id);

-- ============================================================
-- 3. goals(owner_user_id, status) — dashboard + freemium gate
-- ============================================================
-- Dashboard loads goals for a specific user filtered by status.
-- Freemium gate counts active+paused goals per user.
-- The existing goals_workspace_owner(workspace_id, owner_user_id) helps for
-- workspace-scoped queries but not for cross-workspace user-filtered queries.
CREATE INDEX IF NOT EXISTS goals_owner_status
  ON goals(owner_user_id, status);

-- ============================================================
-- 4. check_ins(user_id, goal_id, checked_at DESC) — stats queries
-- ============================================================
-- checkIns.stats runs:
--   SELECT * FROM check_ins WHERE goal_id = ? AND user_id = ?
--     AND checked_at >= now() - INTERVAL '365 days'
--   ORDER BY checked_at DESC
-- The existing check_ins_goal(goal_id, checked_at) covers goal-only lookups.
-- Adding (user_id, goal_id) covers the co-filter pattern.
CREATE INDEX IF NOT EXISTS check_ins_user_goal_time
  ON check_ins(user_id, goal_id, checked_at DESC);

-- ============================================================
-- 5. users(deleted_at) partial index — active-user queries
-- ============================================================
-- users.me and other user lookups filter WHERE deleted_at IS NULL.
-- A partial index only covers non-deleted rows (the common case).
CREATE INDEX IF NOT EXISTS users_active
  ON users(id)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 6. audit_events(target_id) — audit queries by target object
-- ============================================================
CREATE INDEX IF NOT EXISTS audit_events_target
  ON audit_events(target_id)
  WHERE target_id IS NOT NULL;
