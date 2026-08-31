-- Additional workflow.completed rule: also email the assignee (and,
-- via the always-fan-out in dispatchNotification, the APEX_ADMIN_NOTIFY
-- list) when a workflow closes.
--
-- The v1 seed (migration 126) only fires workflow_completed_customer
-- when a workflow reaches completed. That covers the customer + the
-- always-CC'd admins, but the rep who actually owns the work never
-- gets a "here's your completion confirmation" email — and the
-- assignee-focused body reads differently from the customer thank-you.
--
-- This migration adds a second rule keyed to the same trigger that
-- routes to workflow_completed_assignee (send_to_assignee = true,
-- send_once = true). Both rules co-exist because they render
-- different templates for different audiences. APEX_ADMIN_NOTIFY is
-- appended by the notifications library on every dispatch regardless
-- of the rule flags, so the second rule effectively guarantees:
--   1. Assignee (via send_to_assignee)
--   2. James / Anthony / Bryan (via APEX_ADMIN_NOTIFY)
-- Customer also gets their copy through the original rule; the
-- send-once index dedupes if the assignee happens to also be the
-- customer (internal-task workflows).
--
-- Idempotent — ON CONFLICT DO NOTHING against the unique key
-- (trigger_event, workflow_type, stage_key, template_key).

INSERT INTO workflow_notification_rules
  (trigger_event, workflow_type, stage_key, template_key,
   send_to_customer, send_to_assignee, send_to_team_email,
   enabled, send_once, description)
VALUES
  ('workflow.completed', NULL, NULL, 'workflow_completed_assignee',
   false, true, NULL, true, true,
   'Notify the assignee (and APEX_ADMIN_NOTIFY) when a workflow reaches completed')
ON CONFLICT (trigger_event, workflow_type, stage_key, template_key) DO NOTHING;
