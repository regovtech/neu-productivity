-- Migration: 002_onboarding_field
-- Adds onboarding tracking to users.

ALTER TABLE users
  ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
