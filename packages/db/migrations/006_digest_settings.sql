-- Migration 006: Weekly manager digest settings per workspace
-- digest_enabled: opt-in flag (off by default)
-- digest_hour:    UTC hour (0–23) to send on Mondays; defaults to 9 (09:00 UTC)

ALTER TABLE workspaces
  ADD COLUMN digest_enabled BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN digest_hour    SMALLINT    NOT NULL DEFAULT 9
    CHECK (digest_hour BETWEEN 0 AND 23);
