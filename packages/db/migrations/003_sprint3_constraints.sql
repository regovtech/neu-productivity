-- Migration: 003_sprint3_constraints
-- Adds unique constraint on reminders(goal_id, user_id, channel) for upsert support
-- and indexes to support reminder scheduler queries.

ALTER TABLE reminders
  ADD CONSTRAINT reminders_goal_user_channel_uniq UNIQUE (goal_id, user_id, channel);

CREATE INDEX reminders_user_enabled ON reminders(user_id, enabled);
CREATE INDEX reminders_goal         ON reminders(goal_id);
