-- Third storefront kill switch: checkout_enabled.
--
-- Migration 166 seeded public_pages_enabled and enrollment_enabled
-- as the two "off by default" gates for the storefront rollout, but
-- both are READ gates — a browse gate and an enroll gate. The path
-- that creates a real QBO Invoice (/api/storefront/checkout) was
-- data-gated (customer must be enrolled with an approved tenant),
-- not flag-gated. That left the money path without a kill switch
-- separate from the browse and enroll paths.
--
-- storefront.checkout_enabled gates the transactional path — both
-- the checkout call itself and the /api/storefront/quote preview
-- (a priced-but-unbuyable cart is worse than not showing one). It
-- ships false so a deploy alone can't cause money to move; the
-- flag has to be flipped in Supabase to enable purchases.
--
-- Idempotent — ON CONFLICT DO NOTHING keeps this safe to re-run
-- and safe to run after migration 166 with the same key.

INSERT INTO public.platform_feature_flags (key, enabled, description)
VALUES
  ('storefront.checkout_enabled', false,
   'Enable /api/storefront/checkout and /api/storefront/quote. Off = both routes return 503 regardless of tenant/enrollment state. Flipping this is what makes storefront purchases actually possible.')
ON CONFLICT (key) DO NOTHING;
