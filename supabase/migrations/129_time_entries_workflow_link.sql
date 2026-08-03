-- Migration 129 — link time_entries to workflows (optional)
--
-- Adds a nullable workflow_id column so the Time Clock can capture
-- "who's working on what" per clock-in. Left blank for admin overhead
-- and non-workflow work. Executive workload reporting reads this to
-- roll up hours-per-workflow and hours-per-employee-per-workflow.

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS workflow_id uuid REFERENCES public.workflows(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_workflow
  ON public.time_entries(workflow_id)
  WHERE workflow_id IS NOT NULL;

COMMENT ON COLUMN public.time_entries.workflow_id IS
  'Optional link to a workflow the user was working on during this
   clock-in. NULL for admin overhead, breaks, non-workflow work.
   ON DELETE SET NULL so deleting a workflow doesn''t lose the time entry.';
