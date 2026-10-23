-- Machine checkout coffee add-on: capture the signed Free-On-Loan (Equipment
-- Loan & Beverage Supply) agreement and the $99 brewer shipping fee.
--
-- When a guest machine buyer opts into coffee service they get a Flavia C600
-- brewer free on loan, but they must accept the FOL contract (exclusive
-- supply, $1,000/machine/month minimum, and they pay shipping/installation/
-- maintenance). We record the typed signature, the three acknowledgments, the
-- template version signed, and the brewer shipping charged.

ALTER TABLE public.smart_cooler_coffee_leads
  ADD COLUMN IF NOT EXISTS fol_signed           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fol_signature        text,
  ADD COLUMN IF NOT EXISTS fol_signed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS fol_template_version integer,
  ADD COLUMN IF NOT EXISTS fol_acks             jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS brewer_shipping_cents integer NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
