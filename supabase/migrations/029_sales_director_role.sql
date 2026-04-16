-- ==========================================================
-- Add sales_director role for elevated CRM access
-- ==========================================================
-- sales_director gets the same CRM privileges as admin
-- (see all data, assign leads/deals to reps, manage goals,
-- resources, and call lists) without being a platform admin.
-- ==========================================================

-- 1. Assign sales_director role to Louis Cirino
UPDATE public.profiles
  SET role = 'sales_director'
WHERE email = 'louis.cirino@gmail.com';

-- 2. Update the CRM-account sync trigger to also skip sales_director
--    (they are CRM operators, not subjects).
CREATE OR REPLACE FUNCTION public.sync_profile_to_crm_account()
RETURNS trigger AS $$
BEGIN
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
        ELSE entity_type
      END,
      updated_at    = NOW()
    WHERE user_id = NEW.id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
