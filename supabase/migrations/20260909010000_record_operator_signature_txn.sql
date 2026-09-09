-- Phase 5C-a10.1 atomicity fix — record the operator signature and the
-- agreement status/acknowledgment update in ONE transaction.
--
-- Before this, the sign route did two separate writes (INSERT
-- agreement_signatures, then UPDATE purchase_agreements). If the second
-- failed, a durable signature was left behind with no status change and no
-- coffee acknowledgments — a partial, inconsistent state.
--
-- A plpgsql function body runs as a single implicit transaction: any error
-- (constraint violation, RAISE) rolls back every statement in the body. So
-- performing both writes here makes them atomic — the signature never
-- persists unless the status + acknowledgments persist with it.
--
-- SECURITY hardening (privileged SECURITY DEFINER function):
--   * Fixed search_path (public, pg_catalog) — never trusts the caller's.
--   * Every table reference is schema-qualified (public.*).
--   * EXECUTE revoked from PUBLIC/anon/authenticated; granted ONLY to
--     service_role (the Next.js route calls it via the service-role client).
--   * The function determines status and all timestamps itself; the caller
--     cannot pass an agreement status, an acknowledged_at, or any table
--     identifier. It re-validates existence, signability and — when coffee
--     is required — that all three acknowledgments are present, under a row
--     lock, independently of the route.

CREATE OR REPLACE FUNCTION public.record_operator_signature(
  p_agreement_id   uuid,
  p_signer_name    text,
  p_signer_company text,
  p_signer_title   text,
  p_signature_data text,
  p_signature_type text,
  p_ip_address     text,
  p_ack_exclusive_supply        boolean,
  p_ack_minimum_purchase        boolean,
  p_ack_shipping_service_return boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_ag              public.purchase_agreements%ROWTYPE;
  v_sig             public.agreement_signatures%ROWTYPE;
  v_new_status      text;
  v_coffee_required boolean;
  v_now             timestamptz := now();
BEGIN
  -- Lock the agreement row for the duration of the transaction.
  SELECT * INTO v_ag FROM public.purchase_agreements
    WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agreement_not_found';
  END IF;

  -- A cancelled/expired/fully-signed agreement cannot be signed.
  IF v_ag.agreement_status IN ('cancelled', 'expired', 'signed') THEN
    RAISE EXCEPTION 'agreement_not_signable:%', v_ag.agreement_status;
  END IF;

  v_coffee_required := v_ag.coffee_supply_required IS TRUE;

  -- Independently enforce the coffee acknowledgments (defense in depth —
  -- the route validates too, but the privileged writer does not trust it).
  IF v_coffee_required AND NOT (
       p_ack_exclusive_supply IS TRUE
       AND p_ack_minimum_purchase IS TRUE
       AND p_ack_shipping_service_return IS TRUE
     ) THEN
    RAISE EXCEPTION 'coffee_acknowledgments_incomplete';
  END IF;

  -- Idempotent retry: operator already signed → return existing, no dup.
  IF v_ag.operator_signed_at IS NOT NULL THEN
    SELECT * INTO v_sig FROM public.agreement_signatures
      WHERE agreement_id = p_agreement_id AND signer_type = 'operator'
      ORDER BY signed_at DESC NULLS LAST LIMIT 1;
    RETURN jsonb_build_object(
      'signature', to_jsonb(v_sig),
      'agreement_status', v_ag.agreement_status,
      'fully_executed', v_ag.apex_signed_at IS NOT NULL,
      'coffee_acknowledged', v_coffee_required,
      'idempotent', true
    );
  END IF;

  v_new_status := CASE WHEN v_ag.apex_signed_at IS NOT NULL
                       THEN 'signed' ELSE 'partially_signed' END;

  -- Write 1: the signature.
  INSERT INTO public.agreement_signatures (
    agreement_id, signer_type, signer_name, signer_company, signer_title,
    signer_email, signature_data, signature_type, ip_address
  ) VALUES (
    p_agreement_id, 'operator', p_signer_name,
    COALESCE(NULLIF(p_signer_company, ''), v_ag.operator_company_name),
    COALESCE(NULLIF(p_signer_title, ''), v_ag.operator_title),
    v_ag.operator_email,
    p_signature_data, COALESCE(NULLIF(p_signature_type, ''), 'typed'), p_ip_address
  ) RETURNING * INTO v_sig;

  -- Write 2: status + timestamp + (when required) the three coffee acks,
  -- all with the SAME transaction timestamp. Same transaction as write 1.
  UPDATE public.purchase_agreements SET
    agreement_status   = v_new_status,
    operator_signed_at = v_now,
    updated_at         = v_now,
    coffee_ack_exclusive_supply =
      CASE WHEN v_coffee_required THEN true ELSE coffee_ack_exclusive_supply END,
    coffee_ack_minimum_purchase =
      CASE WHEN v_coffee_required THEN true ELSE coffee_ack_minimum_purchase END,
    coffee_ack_shipping_service_return =
      CASE WHEN v_coffee_required THEN true ELSE coffee_ack_shipping_service_return END,
    coffee_acknowledged_at =
      CASE WHEN v_coffee_required THEN v_now ELSE coffee_acknowledged_at END
  WHERE id = p_agreement_id;

  RETURN jsonb_build_object(
    'signature', to_jsonb(v_sig),
    'agreement_status', v_new_status,
    'fully_executed', v_ag.apex_signed_at IS NOT NULL,
    'coffee_acknowledged', v_coffee_required,
    'idempotent', false
  );
END;
$$;

-- Least privilege: this SECURITY DEFINER function must be callable ONLY by
-- the service role the Next.js server uses — never by PostgREST's anon or
-- authenticated roles, and never by PUBLIC (which is the default grant).
REVOKE ALL ON FUNCTION public.record_operator_signature(
  uuid, text, text, text, text, text, text, boolean, boolean, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_operator_signature(
  uuid, text, text, text, text, text, text, boolean, boolean, boolean
) FROM anon;
REVOKE ALL ON FUNCTION public.record_operator_signature(
  uuid, text, text, text, text, text, text, boolean, boolean, boolean
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_operator_signature(
  uuid, text, text, text, text, text, text, boolean, boolean, boolean
) TO service_role;
