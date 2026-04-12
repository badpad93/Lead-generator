-- ==========================================================
-- Auto-create CRM accounts from platform signups
-- ==========================================================
-- When a user signs up (operator, location_manager, or requestor),
-- a sales_accounts row is created automatically so the CRM always
-- reflects the full user base.  Profile updates (company name,
-- phone, address, etc.) are synced to the CRM account in real time
-- via the same trigger.
--
-- A new `user_id` column links the CRM account back to the platform
-- user.  It carries a partial UNIQUE index so each user gets at most
-- one auto-created account (existing manually-created accounts are
-- untouched).
-- ==========================================================

-- 1. Link column
ALTER TABLE public.sales_accounts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_accounts_user_id
  ON public.sales_accounts(user_id) WHERE user_id IS NOT NULL;

-- 2. Trigger function
CREATE OR REPLACE FUNCTION public.sync_profile_to_crm_account()
RETURNS trigger AS $$
BEGIN
  -- Skip admin / sales staff — they are CRM operators, not subjects.
  IF NEW.role NOT IN ('operator', 'location_manager', 'requestor') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.sales_accounts (
      user_id,
      business_name,
      contact_name,
      email,
      phone,
      address,
      entity_type,
      notes
    ) VALUES (
      NEW.id,
      COALESCE(NULLIF(NEW.company_name, ''), NULLIF(NEW.full_name, ''), NEW.email),
      NULLIF(NEW.full_name, ''),
      NULLIF(NEW.email, ''),
      NEW.phone,
      CASE
        WHEN NEW.city IS NOT NULL AND NEW.state IS NOT NULL
        THEN TRIM(
          CONCAT_WS(', ', NULLIF(NEW.address, ''), NEW.city)
          || ', ' || NEW.state
          || COALESCE(' ' || NEW.zip, '')
        )
        ELSE NEW.address
      END,
      CASE NEW.role
        WHEN 'operator'         THEN 'operator'
        WHEN 'location_manager' THEN 'location'
        WHEN 'requestor'        THEN 'location'
      END,
      'Auto-created from signup (' || NEW.role || ')'
    )
    ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING;
    RETURN NEW;
  END IF;

  -- UPDATE — keep the linked CRM account in sync when the user
  -- edits their profile (adds company name, phone, etc.).
  IF TG_OP = 'UPDATE' THEN
    UPDATE public.sales_accounts SET
      business_name = COALESCE(
        NULLIF(NEW.company_name, ''),
        NULLIF(NEW.full_name, ''),
        NEW.email
      ),
      contact_name  = NULLIF(NEW.full_name, ''),
      email         = NULLIF(NEW.email, ''),
      phone         = NEW.phone,
      address       = CASE
        WHEN NEW.city IS NOT NULL AND NEW.state IS NOT NULL
        THEN TRIM(
          CONCAT_WS(', ', NULLIF(NEW.address, ''), NEW.city)
          || ', ' || NEW.state
          || COALESCE(' ' || NEW.zip, '')
        )
        ELSE NEW.address
      END,
      entity_type   = CASE NEW.role
        WHEN 'operator'         THEN 'operator'
        WHEN 'location_manager' THEN 'location'
        WHEN 'requestor'        THEN 'location'
        ELSE entity_type  -- preserve manual classification
      END,
      updated_at    = NOW()
    WHERE user_id = NEW.id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach trigger — fires on INSERT and on UPDATE of profile fields
--    that map to CRM account data.
CREATE TRIGGER on_profile_sync_crm
  AFTER INSERT OR UPDATE OF full_name, email, company_name, phone, address, city, state, zip, role
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_to_crm_account();

-- 4. Backfill existing profiles that don't have a CRM account yet
INSERT INTO public.sales_accounts (
  user_id, business_name, contact_name, email, phone, address, entity_type, notes
)
SELECT
  p.id,
  COALESCE(NULLIF(p.company_name, ''), NULLIF(p.full_name, ''), p.email),
  NULLIF(p.full_name, ''),
  NULLIF(p.email, ''),
  p.phone,
  CASE
    WHEN p.city IS NOT NULL AND p.state IS NOT NULL
    THEN TRIM(
      CONCAT_WS(', ', NULLIF(p.address, ''), p.city)
      || ', ' || p.state
      || COALESCE(' ' || p.zip, '')
    )
    ELSE p.address
  END,
  CASE p.role
    WHEN 'operator'         THEN 'operator'
    WHEN 'location_manager' THEN 'location'
    WHEN 'requestor'        THEN 'location'
    ELSE NULL
  END,
  'Backfill from existing profile (' || p.role || ')'
FROM public.profiles p
WHERE p.role IN ('operator', 'location_manager', 'requestor')
  AND NOT EXISTS (
    SELECT 1 FROM public.sales_accounts sa WHERE sa.user_id = p.id
  );

NOTIFY pgrst, 'reload schema';
