-- ═════════════════════════════════════════════════════════════════════
-- 147 — Rename placement_marketplace_settings.platform_take_cents
--       → platform_take (numeric dollars)
-- ─────────────────────────────────────────────────────────────────────
-- Migration 144 was rewritten in-place after ship to expose the
-- platform take as numeric(10,2) dollars (matching
-- placement_contracts.platform_fee / partner_payout / operator_price),
-- avoiding a 100× unit-mismatch trap on any fallback path that reads
-- the setting when the per-contract override is null.
--
-- Environments that applied the original 144 already have the column
-- as `platform_take_cents` (integer, cents). This migration does the
-- rename + cast for those environments and is a safe no-op elsewhere:
--
--   * Fresh env that only ever ran the new 144 → column is already
--     named `platform_take`; the DO block short-circuits.
--   * Old env that ran the original 144 → column is renamed, value
--     divided by 100 to preserve the setting.
--   * Env with neither column (table missing) → no-op; migration 144
--     will create the correct shape.
--
-- Idempotent — safe to re-run.
-- ═════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  has_cents boolean;
  has_dollars boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'placement_marketplace_settings'
      AND column_name  = 'platform_take_cents'
  ) INTO has_cents;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'placement_marketplace_settings'
      AND column_name  = 'platform_take'
  ) INTO has_dollars;

  -- Only act when we need to rename: cents column present, dollars
  -- column absent. Any other state = target shape already reached
  -- (or table itself missing, which is 144's problem).
  IF has_cents AND NOT has_dollars THEN
    -- 1. Add the new column, nullable + no default so we can backfill
    ALTER TABLE public.placement_marketplace_settings
      ADD COLUMN platform_take numeric(10,2);

    -- 2. Backfill: cents → dollars, rounded to pennies
    UPDATE public.placement_marketplace_settings
       SET platform_take = ROUND(platform_take_cents::numeric / 100, 2);

    -- 3. Lock in NOT NULL + default (matches 144's rewritten shape)
    ALTER TABLE public.placement_marketplace_settings
      ALTER COLUMN platform_take SET NOT NULL,
      ALTER COLUMN platform_take SET DEFAULT 100;

    -- 4. Swap the CHECK constraint. The original 144 named it
    --    placement_marketplace_settings_platform_take_cents_check
    --    (auto-generated from the column name); the new rule is
    --    unit-agnostic non-negative.
    ALTER TABLE public.placement_marketplace_settings
      DROP CONSTRAINT IF EXISTS placement_marketplace_settings_platform_take_cents_check;

    ALTER TABLE public.placement_marketplace_settings
      ADD CONSTRAINT placement_marketplace_settings_platform_take_check
        CHECK (platform_take >= 0);

    -- 5. Drop the old cents column now that data is migrated
    ALTER TABLE public.placement_marketplace_settings
      DROP COLUMN platform_take_cents;
  END IF;
END $$;
