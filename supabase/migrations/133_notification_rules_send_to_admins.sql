-- Migration 133: notify all admins on deadline.overdue
--
-- The existing overdue rule notifies the assignee daily (send_once=false).
-- Admins had no visibility unless they were the assignee. This migration
-- adds a send_to_admins flag on workflow_notification_rules and seeds a
-- new admin rule for deadline.overdue that fires once per (workflow,
-- admin) — so admins get exactly one email the first time a workflow
-- crosses its deadline, not a daily replay.
--
-- resolveRecipients() in src/lib/workflows/notifications.ts resolves
-- profiles.role='admin' → email when this flag is on.

ALTER TABLE public.workflow_notification_rules
  ADD COLUMN IF NOT EXISTS send_to_admins boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workflow_notification_rules.send_to_admins IS
  'When true, resolveRecipients loads every profiles.role=admin email and adds it to the recipient list.';

INSERT INTO workflow_notification_rules
  (trigger_event, workflow_type, stage_key, template_key,
   send_to_customer, send_to_assignee, send_to_team_email,
   enabled, send_once, send_to_admins, description)
VALUES
  ('deadline.overdue', NULL, NULL, 'overdue_admin',
   false, false, NULL,
   true, true, true,
   'Notify every admin the first time a workflow crosses its deadline')
ON CONFLICT (trigger_event, workflow_type, stage_key, template_key) DO UPDATE
  SET send_to_admins = EXCLUDED.send_to_admins,
      send_once      = EXCLUDED.send_once,
      enabled        = EXCLUDED.enabled;
