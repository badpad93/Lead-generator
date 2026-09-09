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
-- Idempotent: if the operator has already signed, it returns the existing
-- state without inserting a duplicate. Coffee acknowledgments are set true
-- only when coffee_supply_required (the route validates all three were
-- checked before calling); acknowledged_at is the single in-transaction now().

CREATE OR REPLACE FUNCTION public.record_operator_signature(
  p_agreement_id   uuid,
  p_signer_name    text,
  p_signer_company text,
  p_signer_title   text,
  p_signature_data text,
  p_signature_type text,
  p_ip_address     text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.record_operator_signature(
  uuid, text, text, text, text, text, text
) TO service_role;
