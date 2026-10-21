-- Smart Coolers: make a landing-grid card directly purchasable (its own price
-- + Buy button), billed through the same QuickBooks invoice flow as machines.

-- Direct sale price in cents (NULL = not directly buyable).
ALTER TABLE public.smart_cooler_machines
  ADD COLUMN IF NOT EXISTS price_cents integer;

-- Record of a direct smart-cooler purchase (one QB invoice each).
CREATE TABLE IF NOT EXISTS public.smart_cooler_purchases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id    uuid REFERENCES public.smart_cooler_machines(id) ON DELETE SET NULL,
  user_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email         text,
  full_name     text,
  phone         text,
  amount_cents  integer NOT NULL,
  qb_invoice_id text,
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_cooler_purchases_machine ON public.smart_cooler_purchases (machine_id);

-- Service-role only (admin reads/writes via supabaseAdmin); no public policy.
ALTER TABLE public.smart_cooler_purchases ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
