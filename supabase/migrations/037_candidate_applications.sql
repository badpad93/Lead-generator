-- Migration 037: Pre-pipeline candidates with assignment
-- Adds 'application' status for candidates not yet in the hiring pipeline,
-- and an assigned_to column so candidates can be assigned to a market leader, DOS, or admin.

-- 1. Drop and re-add the status CHECK to include 'application'
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_status_check;
ALTER TABLE candidates ADD CONSTRAINT candidates_status_check CHECK (status IN (
  'application',
  'interview',
  'pending_admin_review_1',
  'welcome_docs_sent',
  'pending_admin_review_2',
  'completed',
  'assigned_to_training',
  'terminated'
));

-- 2. Add assigned_to column
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id);

-- 3. Add notes column for candidate notes
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS notes TEXT;
