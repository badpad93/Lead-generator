-- Migration 128 — seed the customer.approval_needed notification rule.
-- Fires each time admin approves a PP submission for a customer's
-- location_services workflow. send_once=false so the customer gets one
-- email per submission (not just the first).

INSERT INTO workflow_notification_rules
  (trigger_event, workflow_type, stage_key, template_key,
   send_to_customer, send_to_assignee, send_to_team_email,
   enabled, send_once, description)
VALUES
  ('customer.approval_needed', 'location_services', NULL,
   'approval_needed_customer',
   true, false, NULL, true, false,
   'Fires when admin approves a PP submission — customer must accept or decline on their workflow page')
ON CONFLICT (trigger_event, workflow_type, stage_key, template_key) DO NOTHING;
