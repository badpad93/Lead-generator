-- ───────────────────────────────────────────────────────────────────────────
-- Migration 125 — Unified Workflows System
--
-- Adds a single source of truth for the fulfillment lifecycle of every
-- customer product or service (AI machines, location services, financing,
-- coffee equipment & recurring service, website builds, and future types).
--
-- Design notes:
--   * Mirrors the existing user_agreements + agreement_audit_events
--     conventions (immutable event log, service-role-only RLS, jsonb
--     metadata) so operators already familiar with the codebase read this
--     as an extension, not a new paradigm.
--   * Idempotent by construction — a unique index on
--     (source_type, source_id, workflow_type, product_key) means the
--     same source event never spawns duplicates.
--   * All FKs use ON DELETE SET NULL where reasonable so a deleted
--     upstream record never orphans the workflow record; the workflow
--     stays discoverable in the audit log even after cleanup.
--   * RLS: service-role-only for writes; customers see only
--     workflows.customer_id = auth.uid(); staff via role check.
-- ───────────────────────────────────────────────────────────────────────────

-- ─── Sequence for human-readable workflow numbers (WF-000001, ...) ────────
CREATE SEQUENCE IF NOT EXISTS workflow_number_seq START 1;

-- ─── Templates ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_type text NOT NULL,
  version int NOT NULL DEFAULT 1,
  title text NOT NULL,
  description text,
  default_deadline_days int,
  quantity_based boolean NOT NULL DEFAULT false,
  completion_rule text NOT NULL DEFAULT 'all_required_stages_completed'
    CHECK (completion_rule IN (
      'all_required_stages_completed',
      'quantity_reached_on_final_stages',
      'terminal_status',
      'never_auto_completes'
    )),
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_type, version)
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_type ON workflow_templates(workflow_type);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_active ON workflow_templates(active) WHERE active = true;

CREATE TABLE IF NOT EXISTS workflow_template_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  stage_key text NOT NULL,
  stage_name text NOT NULL,
  stage_order int NOT NULL,
  stage_type text NOT NULL
    CHECK (stage_type IN ('quantity', 'status', 'date', 'approval', 'document', 'milestone')),
  required_for_completion boolean NOT NULL DEFAULT false,
  customer_visible boolean NOT NULL DEFAULT true,
  default_customer_message text,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (template_id, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_workflow_template_stages_template ON workflow_template_stages(template_id, stage_order);

-- ─── Core workflow record ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_number text NOT NULL UNIQUE
    DEFAULT ('WF-' || lpad(nextval('workflow_number_seq')::text, 6, '0')),

  -- Ownership
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  company_id uuid REFERENCES sales_accounts(id) ON DELETE SET NULL,

  -- Type + template
  workflow_type text NOT NULL,
  template_id uuid REFERENCES workflow_templates(id) ON DELETE RESTRICT,
  template_version int,

  -- Human display
  title text NOT NULL,
  description text,

  -- Origin (exactly one of the *_id foreign keys is typically set)
  source_type text NOT NULL
    CHECK (source_type IN (
      'agreement',
      'sales_order',
      'coffee_order',
      'coffee_agreement',
      'machine_listing_purchase',
      'location_request',
      'placement_agreement',
      'financing_application',
      'website_request',
      'legacy_backfill',
      'admin_manual'
    )),
  source_id uuid NOT NULL,

  -- Cross-links (nullable — populated when the corresponding source_type applies)
  agreement_id uuid REFERENCES user_agreements(id) ON DELETE SET NULL,
  order_id uuid REFERENCES sales_orders(id) ON DELETE SET NULL,
  coffee_order_id uuid,        -- FK not enforced; coffee_orders may live in a different schema state per env
  purchase_id uuid,            -- machine_listing_purchases.id (not FK'd to avoid hard coupling)
  location_request_id uuid,    -- location intake requests
  placement_contract_id uuid REFERENCES placement_contracts(id) ON DELETE SET NULL,
  financing_application_id uuid,
  website_request_id uuid REFERENCES website_requests(id) ON DELETE SET NULL,

  -- Product identity (used for idempotency when one agreement fans out to N products)
  product_key text,            -- 'ai_cooler_standard', 'location_services', 'coffee_brewer_x1', etc.
  product_name text,           -- Human name shown in UI
  service_id text,

  -- Quantities
  quantity_purchased numeric NOT NULL DEFAULT 1 CHECK (quantity_purchased >= 0),
  quantity_completed numeric NOT NULL DEFAULT 0 CHECK (quantity_completed >= 0),

  -- Money + progress
  payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded', 'na')),
  overall_status text NOT NULL DEFAULT 'not_started'
    CHECK (overall_status IN (
      'draft',
      'pending_payment',
      'ready_to_begin',
      'not_started',
      'in_progress',
      'waiting_on_customer',
      'waiting_on_vendor',
      'on_hold',
      'at_risk',
      'overdue',
      'completed',
      'cancelled',
      'refunded',
      'expired'
    )),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Timeline
  start_date timestamptz,
  due_date timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,

  -- Assignment
  assigned_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  primary_team text,           -- 'fulfillment' | 'locations' | 'financing' | 'coffee' | null

  -- Visibility toggles
  show_assignee_to_customer boolean NOT NULL DEFAULT false,
  imported_from_legacy boolean NOT NULL DEFAULT false,
  suppress_initial_customer_email boolean NOT NULL DEFAULT false,

  -- Actors
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,

  -- Optimistic concurrency
  version int NOT NULL DEFAULT 1,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Sanity: completed_quantity never exceeds purchased_quantity unless
  -- an admin explicitly overrides via metadata (checked at service layer).
  CHECK (quantity_completed <= quantity_purchased OR (metadata ? 'over_target_override'))
);

-- Idempotency: same origin cannot spawn a duplicate workflow of the same
-- type for the same product. product_key is coalesced to '' so records
-- with no product distinction (e.g. one financing per application) still
-- dedupe correctly.
CREATE UNIQUE INDEX IF NOT EXISTS uq_workflows_source
  ON workflows (source_type, source_id, workflow_type, coalesce(product_key, ''));

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_workflows_customer ON workflows(customer_id);
CREATE INDEX IF NOT EXISTS idx_workflows_company ON workflows(company_id);
CREATE INDEX IF NOT EXISTS idx_workflows_assigned ON workflows(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_type ON workflows(workflow_type);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(overall_status);
CREATE INDEX IF NOT EXISTS idx_workflows_due ON workflows(due_date) WHERE completed_at IS NULL AND cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workflows_agreement ON workflows(agreement_id);
CREATE INDEX IF NOT EXISTS idx_workflows_order ON workflows(order_id);

-- ─── Per-stage progress ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  template_stage_id uuid REFERENCES workflow_template_stages(id) ON DELETE SET NULL,

  stage_key text NOT NULL,
  stage_name text NOT NULL,
  stage_order int NOT NULL,
  stage_type text NOT NULL
    CHECK (stage_type IN ('quantity', 'status', 'date', 'approval', 'document', 'milestone')),

  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'blocked', 'completed', 'skipped')),

  -- Quantity fields (used when stage_type = 'quantity')
  target_quantity numeric,
  completed_quantity numeric NOT NULL DEFAULT 0 CHECK (completed_quantity >= 0),

  -- Visibility
  customer_visible boolean NOT NULL DEFAULT true,
  required_for_completion boolean NOT NULL DEFAULT false,

  -- Notes
  internal_notes text,
  customer_message text,

  -- Timestamps
  started_at timestamptz,
  completed_at timestamptz,

  -- Actors
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,

  -- Optimistic concurrency
  version int NOT NULL DEFAULT 1,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (workflow_id, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_workflow_stages_workflow ON workflow_stages(workflow_id, stage_order);
CREATE INDEX IF NOT EXISTS idx_workflow_stages_status ON workflow_stages(status);

-- ─── Immutable audit log ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES workflow_stages(id) ON DELETE SET NULL,

  event_type text NOT NULL,
  -- Common values: 'created', 'stage_updated', 'quantity_updated',
  -- 'status_changed', 'assignment_changed', 'deadline_changed',
  -- 'note_added', 'customer_message_published', 'cancelled',
  -- 'reopened', 'imported', 'shipment_added', 'notification_sent'

  previous_value jsonb,
  new_value jsonb,
  changed_fields text[],

  actor_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'staff'
    CHECK (actor_type IN ('staff', 'customer', 'system', 'webhook', 'cron')),
  source text,             -- e.g. 'coffee_checkout', 'qb_webhook'
  change_key text,         -- external idempotency key (webhook event id, etc.)
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_workflow ON workflow_events(workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_events_type ON workflow_events(event_type);
-- Prevents double-processing of retried webhooks: same (workflow, change_key)
-- can only produce one event.
CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_events_change_key
  ON workflow_events(workflow_id, change_key) WHERE change_key IS NOT NULL;

-- ─── Assignments (multiple collaborators) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team text,               -- 'fulfillment' | 'locations' | 'financing' | 'coffee'
  role text NOT NULL DEFAULT 'observer'
    CHECK (role IN (
      'primary_owner', 'sales_rep', 'financing_coordinator',
      'location_specialist', 'fulfillment_coordinator', 'shipping_coordinator',
      'coffee_service_rep', 'manager', 'observer'
    )),
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (workflow_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_workflow_assignments_workflow ON workflow_assignments(workflow_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_workflow_assignments_user ON workflow_assignments(user_id) WHERE active = true;

-- ─── Notes (internal + customer-visible) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal', 'customer')),
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  mentions uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_notes_workflow ON workflow_notes(workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_notes_visibility ON workflow_notes(workflow_id, visibility);

-- ─── Shipments (for machine + coffee fulfillment) ─────────────────────────
CREATE TABLE IF NOT EXISTS workflow_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  carrier text,
  tracking_number text,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  ship_date timestamptz,
  est_delivery_date timestamptz,
  actual_delivery_date timestamptz,
  freight_provider text,
  bol_url text,
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_shipments_workflow ON workflow_shipments(workflow_id, ship_date DESC);

-- ─── Coffee-order sub-items (per-order fulfillment status) ────────────────
-- Each customer coffee_order attaches to their coffee_service workflow so
-- admin/user can mark individual orders 'fulfilled' without touching the
-- overall workflow status.
CREATE TABLE IF NOT EXISTS workflow_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  external_order_id uuid NOT NULL,
  external_order_type text NOT NULL DEFAULT 'coffee_order'
    CHECK (external_order_type IN ('coffee_order', 'sales_order', 'other')),
  order_number text,
  order_total numeric,
  order_status text,
  fulfillment_status text NOT NULL DEFAULT 'pending'
    CHECK (fulfillment_status IN ('pending', 'processing', 'shipped', 'fulfilled', 'cancelled')),
  fulfilled_at timestamptz,
  fulfilled_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, external_order_id, external_order_type)
);

CREATE INDEX IF NOT EXISTS idx_workflow_order_items_workflow ON workflow_order_items(workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_order_items_external ON workflow_order_items(external_order_id);

-- ─── Notification rules + delivery log ────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_event text NOT NULL,
  workflow_type text,          -- null = applies to all types
  stage_key text,              -- null = fires regardless of stage
  template_key text NOT NULL,
  send_to_customer boolean NOT NULL DEFAULT false,
  send_to_assignee boolean NOT NULL DEFAULT false,
  send_to_team_email text,     -- direct email address (or null)
  enabled boolean NOT NULL DEFAULT true,
  send_once boolean NOT NULL DEFAULT true,
  delay_minutes int NOT NULL DEFAULT 0,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trigger_event, workflow_type, stage_key, template_key)
);

CREATE INDEX IF NOT EXISTS idx_workflow_notification_rules_trigger
  ON workflow_notification_rules(trigger_event, workflow_type) WHERE enabled = true;

CREATE TABLE IF NOT EXISTS workflow_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES workflow_notification_rules(id) ON DELETE SET NULL,
  trigger_event text NOT NULL,
  template_key text NOT NULL,
  recipient text NOT NULL,
  stage_key text,
  resend_message_id text,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed', 'skipped_duplicate')),
  failure_reason text,
  retry_count int NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_workflow_notification_log_workflow ON workflow_notification_log(workflow_id, sent_at DESC);
-- Send-once guarantee: when a rule has send_once=true the service checks
-- this partial unique index before dispatching.
CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_notification_send_once
  ON workflow_notification_log (workflow_id, trigger_event, template_key, recipient, coalesce(stage_key, ''))
  WHERE status = 'sent';

-- ─── Updated_at triggers ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION workflows_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'workflow_templates', 'workflows', 'workflow_stages', 'workflow_notes',
    'workflow_shipments', 'workflow_order_items', 'workflow_notification_rules'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_touch ON %1$s;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_touch BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION workflows_touch_updated_at();',
      t
    );
  END LOOP;
END $$;

-- ─── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_template_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_notification_log ENABLE ROW LEVEL SECURITY;

-- Service role always has full access (API routes hold the service key).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'workflow_templates', 'workflow_template_stages', 'workflows', 'workflow_stages',
    'workflow_events', 'workflow_assignments', 'workflow_notes', 'workflow_shipments',
    'workflow_order_items', 'workflow_notification_rules', 'workflow_notification_log'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Service role full access" ON %I;', t);
    EXECUTE format(
      'CREATE POLICY "Service role full access" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true);',
      t
    );
  END LOOP;
END $$;

-- Authenticated customer: read own workflows only. Writes go through API routes.
DROP POLICY IF EXISTS "Customer reads own workflows" ON workflows;
CREATE POLICY "Customer reads own workflows"
  ON workflows FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Customer reads stages for own workflows" ON workflow_stages;
CREATE POLICY "Customer reads stages for own workflows"
  ON workflow_stages FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM workflows w WHERE w.id = workflow_id AND w.customer_id = auth.uid())
    AND customer_visible = true
  );

DROP POLICY IF EXISTS "Customer reads customer-visible notes" ON workflow_notes;
CREATE POLICY "Customer reads customer-visible notes"
  ON workflow_notes FOR SELECT TO authenticated
  USING (
    visibility = 'customer'
    AND EXISTS (SELECT 1 FROM workflows w WHERE w.id = workflow_id AND w.customer_id = auth.uid())
  );

DROP POLICY IF EXISTS "Customer reads shipments for own workflows" ON workflow_shipments;
CREATE POLICY "Customer reads shipments for own workflows"
  ON workflow_shipments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM workflows w WHERE w.id = workflow_id AND w.customer_id = auth.uid()));

DROP POLICY IF EXISTS "Customer reads own order items" ON workflow_order_items;
CREATE POLICY "Customer reads own order items"
  ON workflow_order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM workflows w WHERE w.id = workflow_id AND w.customer_id = auth.uid()));

-- Templates are public-read for authenticated (needed for customer UI to
-- render stage names + descriptions). No sensitive data lives here.
DROP POLICY IF EXISTS "Authenticated read templates" ON workflow_templates;
CREATE POLICY "Authenticated read templates"
  ON workflow_templates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read template stages" ON workflow_template_stages;
CREATE POLICY "Authenticated read template stages"
  ON workflow_template_stages FOR SELECT TO authenticated USING (true);

-- Events, assignments, internal notes, notification rules/log are staff-only
-- via the API layer. No authenticated read policy — customers cannot see them
-- even if they somehow query directly. Staff routes use service role.
-- (No policy added → default deny for non-service-role.)
