-- ═════════════════════════════════════════════════════════════════
-- 180 — profiles.role: add 'customer' (storefront tenant shoppers)
-- ─────────────────────────────────────────────────────────────────
-- ROOT CAUSE of the tenants-stuck-on-/complete-profile loop.
--
-- The storefront-invite signup writes role='customer', but the
-- profiles_role_check constraint (last rewritten in migration 149)
-- never included 'customer'. Every such write failed at the DB —
-- and the signup-email route didn't check the upsert error — so
-- invited tenants ended up with the bare trigger-created profile:
-- wrong role, no contact fields. Every completeness gate then
-- fired on what genuinely looked like an incomplete operator
-- account, and none of the role-based customer exemptions could
-- ever match.
--
-- This migration adds 'customer' to the allowed list, and repairs
-- profiles that were corrupted by the silent failure: any profile
-- already permanently linked to a storefront tenant whose role is
-- still the signup default gets flipped to 'customer'.
-- ═════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'operator', 'locator', 'location_manager', 'requestor',
    'admin', 'sales', 'sales_manager', 'director_of_sales', 'market_leader',
    'placement_partner', 'manufacturer_partner',
    'customer'
  ));

-- Repair: enrolled storefront customers whose role write was
-- silently rejected. Only touches accounts linked to a tenant and
-- still carrying the generic signup defaults — real operators who
-- enrolled as shoppers keep their operator role.
UPDATE public.profiles
   SET role = 'customer'
 WHERE storefront_tenant_id IS NOT NULL
   AND role IN ('requestor');
