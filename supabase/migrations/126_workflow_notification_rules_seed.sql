-- Migration 126 — seed workflow_notification_rules with the initial
-- customer + employee notification catalog. All rules are enabled +
-- send_once by default. Rows can be toggled or removed later without
-- code changes; the notification service reads them at dispatch time.

INSERT INTO workflow_notification_rules
  (trigger_event, workflow_type, stage_key, template_key,
   send_to_customer, send_to_assignee, send_to_team_email,
   enabled, send_once, description)
VALUES
  -- ── Customer-facing ────────────────────────────────────────────────
  ('workflow.created',                NULL,                       NULL, 'workflow_created_customer',       true,  false, NULL, true, true,  'Confirm to customer that fulfillment has begun'),
  ('machine.shipped',                 'ai_machine_fulfillment',   NULL, 'machine_shipped_customer',        true,  false, NULL, true, false, 'Fires each shipment on machine fulfillment (send_once=false; multi-shipment support)'),
  ('machine.delivered',               'ai_machine_fulfillment',   NULL, 'machine_delivered_customer',      true,  false, NULL, true, false, 'Fires each delivery on machine fulfillment'),
  ('location.secured',                'location_services',        NULL, 'location_secured_customer',       true,  false, NULL, true, false, 'Fires each location secured (send_once=false so N locations = N emails)'),
  ('location.completed',              'location_services',        NULL, 'location_completed_customer',     true,  false, NULL, true, true,  'Fires once when the location workflow completes'),
  ('financing.approved',              'financing',                NULL, 'financing_approved_customer',     true,  false, NULL, true, true,  'Fires when financing reaches approved status'),
  ('financing.funded',                'financing',                NULL, 'financing_funded_customer',       true,  false, NULL, true, true,  'Fires when financing reaches funded status'),
  ('workflow.completed',              NULL,                       NULL, 'workflow_completed_customer',     true,  false, NULL, true, true,  'Fires once when any workflow reaches completed'),
  ('customer.action_required',        NULL,                       NULL, 'action_required_customer',       true,  false, NULL, true, false, 'Manual trigger for staff to prompt a customer response'),
  ('deadline.changed',                NULL,                       NULL, 'deadline_changed_customer',      true,  false, NULL, true, false, 'Fires whenever an admin changes a deadline'),

  -- ── Employee-facing ────────────────────────────────────────────────
  ('assignment.created',              NULL,                       NULL, 'assignment_created_employee',     false, true,  NULL, true, false, 'Notify assignee on new assignment'),
  ('deadline.due_soon',               NULL,                       NULL, 'due_soon_employee',               false, true,  NULL, true, false, 'Daily cron fires this for workflows within WORKFLOWS_DUE_SOON_DAYS'),
  ('deadline.overdue',                NULL,                       NULL, 'overdue_employee',                false, true,  NULL, true, false, 'Daily cron fires this for workflows past their deadline')
ON CONFLICT (trigger_event, workflow_type, stage_key, template_key) DO NOTHING;
