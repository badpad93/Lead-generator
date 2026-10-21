-- Smart Coolers: let a marketing machine card link to a real sellable listing
-- so the public card can show a Buy button that reuses the machine checkout.

ALTER TABLE public.smart_cooler_machines
  ADD COLUMN IF NOT EXISTS listing_id uuid REFERENCES public.machine_listings(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
