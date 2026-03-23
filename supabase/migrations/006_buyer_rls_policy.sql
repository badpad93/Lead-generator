-- ============================================================
-- BUYER ACCESS — allow purchasers to read purchased leads
-- ============================================================
-- Without this policy, once a lead is marked is_public=false after
-- purchase, only the owner (created_by) can read it via RLS.
-- This policy lets the buyer read it too.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vending_requests' AND policyname='Buyers can view purchased requests') THEN
    CREATE POLICY "Buyers can view purchased requests"
      ON public.vending_requests FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.lead_purchases
          WHERE lead_purchases.request_id = vending_requests.id
            AND lead_purchases.user_id = auth.uid()
            AND lead_purchases.status = 'completed'
        )
      );
  END IF;
END $$;
