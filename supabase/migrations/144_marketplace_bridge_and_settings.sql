-- ═════════════════════════════════════════════════════════════════════
-- 144 — Marketplace bridge + admin-editable platform take
-- ─────────────────────────────────────────────────────────────────────
-- Two additions:
--
--   1. placement_contracts.workflow_id
--      Direct FK back to the location_services workflow so paymentSync
--      + approvals can join in either direction without threading
--      metadata. Backfill isn't needed — existing contracts spawned
--      from purchase agreements can be linked lazily if surfaced.
--
--   2. placement_marketplace_settings (singleton row)
--      Marketplace-wide policy knobs. Right now that's just the default
--      platform take VC keeps per completed location — admin-editable
--      via the settings UI. Per-contract overrides still live on
--      placement_contracts.platform_fee / partner_payout for bespoke
--      deals, so this default only seeds the auto-created contracts.
--
--      Column is numeric DOLLARS (not cents) to stay unit-consistent
--      with placement_contracts.platform_fee / partner_payout /
--      operator_price — every money field on that path is dollars,
--      so a bespoke override reads cleanly against the default.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE public.placement_contracts
  ADD COLUMN IF NOT EXISTS workflow_id uuid REFERENCES public.workflows(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_workflow
  ON public.placement_contracts(workflow_id);

CREATE TABLE IF NOT EXISTS public.placement_marketplace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Dollars VC keeps per completed location by default. Matches the
  -- original tier 1/2/3 platform_fee constant of $100.
  platform_take numeric(10,2) NOT NULL DEFAULT 100
    CHECK (platform_take >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.placement_marketplace_settings (platform_take)
SELECT 100
WHERE NOT EXISTS (SELECT 1 FROM public.placement_marketplace_settings);

ALTER TABLE public.placement_marketplace_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'placement_marketplace_settings'
                   AND policyname = 'service_role_placement_settings') THEN
    CREATE POLICY service_role_placement_settings
      ON public.placement_marketplace_settings FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
