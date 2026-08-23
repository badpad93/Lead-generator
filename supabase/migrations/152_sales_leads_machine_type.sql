-- Migration 152: machine_type on sales_leads
--
-- Adds a nullable machine_type column to sales_leads so the
-- /request-location form can capture which product line the operator
-- wants placed. Legacy rows stay NULL; the CHECK constraint only
-- validates NEW values so backfill isn't required.
--
-- The five accepted values match the /request-location page selector
-- exactly: Combo, AI, Water, Coffee, ATM. Kept as text (not enum) so
-- future additions don't need a schema migration on every enum change.

ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS machine_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_leads_machine_type_check'
  ) THEN
    ALTER TABLE public.sales_leads
      ADD CONSTRAINT sales_leads_machine_type_check
      CHECK (machine_type IS NULL OR machine_type IN ('Combo', 'AI', 'Water', 'Coffee', 'ATM'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sales_leads_machine_type_idx
  ON public.sales_leads (machine_type)
  WHERE machine_type IS NOT NULL;

NOTIFY pgrst, 'reload schema';
