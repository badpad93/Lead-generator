-- Migration 134: workflow_assignments.accepted_at
--
-- Adds an acknowledgement timestamp so a newly-assigned rep can
-- explicitly Accept a workflow. Until they do, the assignment shows
-- a "Pending acceptance" badge on the workflow detail page, giving
-- admins visibility into who has and hasn't picked up their work.
--
-- Nullable — every existing assignment implicitly stays "not yet
-- accepted" until the assignee clicks Accept, or the admin can leave
-- them null since the state is informational, not gating.

ALTER TABLE public.workflow_assignments
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

COMMENT ON COLUMN public.workflow_assignments.accepted_at IS
  'When the assignee clicked "Accept" on the workflow detail page. Null = pending acceptance. Only the assignee themselves can set this.';
