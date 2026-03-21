-- ============================================================
-- POST-PURCHASE FIELDS
-- ============================================================

-- Add contact fields to vending_requests for lead detail completeness
ALTER TABLE public.vending_requests
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS decision_maker_name text;

-- Add buyer_email to lead_purchases to store the Stripe checkout email
ALTER TABLE public.lead_purchases
  ADD COLUMN IF NOT EXISTS buyer_email text;
