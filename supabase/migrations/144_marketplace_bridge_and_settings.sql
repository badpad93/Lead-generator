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
--      placement_contracts.partner_payout/platform_fee, so a bespoke
--      contract can diverge from the default without a migration.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE public.placement_contracts
  ADD COLUMN IF NOT EXISTS workflow_id uuid REFERENCES public.workflows(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_workflow
  ON public.placement_contracts(workflow_id);

CREATE TABLE IF NOT EXISTS public.placement_marketplace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Cents VC keeps per completed location by default. Original
  -- tier 1/2/3 seeds all set platform_fee = 100 dollars = 10000 cents.
  platform_take_cents integer NOT NULL DEFAULT 10000
    CHECK (platform_take_cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.placement_marketplace_settings (platform_take_cents)
SELECT 10000
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
