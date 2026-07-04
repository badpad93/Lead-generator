-- Phase 3 — Sales attribution model.
--
-- Every order can carry one-to-many credited users, each with a role code
-- and a percentage. The sum of percentages on an unreleased order must equal
-- 100 (enforced at the API layer — sum-as-you-build via trigger would need
-- deferrable constraints and blocks partial edits).
--
-- Once a "lock event" fires (quote_sent | agreement_sent | order_sent),
-- attribution locks:
--   - Sales reps can no longer edit
--   - Admins can override with a documented reason (audit_logs row)
--
-- Roles are configurable — five defaults ship, admin can add/rename/soft-
-- delete via /admin/financial/settings.

-- ─── Attribution roles (configurable) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS attribution_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,        -- machine-readable identifier
  label text NOT NULL,              -- human-facing label
  description text,
  sort_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,   -- system roles can't be deleted
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attribution_roles_active ON attribution_roles(is_active, sort_order);

-- Seed the five defaults
INSERT INTO attribution_roles (code, label, description, sort_order, is_system)
VALUES
  ('lead_owner', 'Lead Owner', 'The rep who created or properly claimed the lead. Default 100% attribution.', 10, true),
  ('closer', 'Closer', 'The rep who owned the deal at close.', 20, true),
  ('referrer', 'Referrer', 'Person or partner who referred the lead.', 30, true),
  ('assist', 'Support / Assist', 'Anyone who materially helped close the deal without owning it.', 40, true),
  ('manager_override', 'Manager Override', 'Manager or director credit on team plays.', 50, true)
ON CONFLICT (code) DO NOTHING;

-- ─── Sales attributions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  role_code text NOT NULL REFERENCES attribution_roles(code) ON DELETE RESTRICT,
  percentage numeric(6,3) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  notes text,

  -- Lock state (set on quote_sent / agreement_sent / order_sent)
  locked_at timestamptz,
  locked_by_event text CHECK (locked_by_event IS NULL OR locked_by_event IN (
    'quote_sent', 'agreement_sent', 'order_sent', 'manual_admin_lock'
  )),

  is_legacy_backfill boolean NOT NULL DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),

  UNIQUE (order_id, user_id, role_code)   -- one credit per (order, user, role)
);

CREATE INDEX IF NOT EXISTS idx_attributions_order ON sales_attributions(order_id);
CREATE INDEX IF NOT EXISTS idx_attributions_user ON sales_attributions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attributions_role ON sales_attributions(role_code);
CREATE INDEX IF NOT EXISTS idx_attributions_locked ON sales_attributions(order_id) WHERE locked_at IS NOT NULL;

-- ─── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE attribution_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON attribution_roles;
CREATE POLICY "Service role only" ON attribution_roles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Every authenticated user can read the role list (populates dropdowns).
DROP POLICY IF EXISTS "Read roles" ON attribution_roles;
CREATE POLICY "Read roles" ON attribution_roles
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Service role only" ON sales_attributions;
CREATE POLICY "Service role only" ON sales_attributions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Reps can SELECT rows where they're credited (used by "My Performance"
-- pages in Phase 5). Admin-facing "all orders" views hit through the API
-- layer with service role.
DROP POLICY IF EXISTS "Rep reads own attributions" ON sales_attributions;
CREATE POLICY "Rep reads own attributions" ON sales_attributions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
