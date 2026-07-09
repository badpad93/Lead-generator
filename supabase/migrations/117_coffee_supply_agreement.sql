-- Coffee Supply Agreement — real signable template.
--
-- Reuses the generic agreement_templates + user_agreements + audit tables
-- established for the Placement Provider Agreement in migration 115. The
-- signing UX + state machine + admin countersign flow are shared.
--
-- The checkbox on the coffee application form was never a real agreement.
-- This migration seeds the real Equipment Loan & Beverage Supply Agreement
-- as version 1 (agreement_type='coffee_supply') and grants legacy_approved
-- to every operator who was already coffee_access_enabled so we don't
-- immediately block them from ordering. The banner + admin dashboard will
-- prompt legacy users to sign the real one at their convenience.

-- ─── Seed coffee_supply v1 ─────────────────────────────────────────
-- Content mirrors the source PDF. Coffee-specific form fields (customer
-- name, address, number of machines, authorized-representative name/title,
-- and the three acknowledgments) are captured on user_agreements.metadata
-- at sign time — no schema change to user_agreements is required because
-- metadata is already jsonb.
INSERT INTO agreement_templates (
  agreement_type, version, title, effective_date, is_active, content_html, content_hash
) VALUES (
  'coffee_supply',
  1,
  'Apex AI Vending — Equipment Loan & Beverage Supply Agreement',
  CURRENT_DATE,
  true,
  $$
  <h1>Apex AI Vending — Equipment Loan &amp; Beverage Supply Agreement</h1>
  <p><em>the apex of retail innovation</em></p>

  <h2>1. Parties</h2>
  <p>This Equipment Loan and Beverage Supply Agreement ("Agreement") is entered into by and between Apex AI Vending ("Company") and the Customer identified on the signature page below.</p>

  <h2>2. Term</h2>
  <p>The initial term of this Agreement shall be five (5) years from the Effective Date, automatically renewing for successive one (1) year terms unless terminated by either party with thirty (30) days written notice.</p>

  <h2>3. Equipment Loan</h2>
  <p>Company agrees to provide Customer with beverage vending equipment ("Equipment") at no charge, subject to the terms and conditions of this Agreement. The number of machines is specified on the signature page below.</p>

  <h2>4. Shipping</h2>
  <p>Company shall arrange and pay for shipping of Equipment to Customer location. Customer shall be responsible for receiving and placing Equipment at designated location.</p>

  <h2>5. Exclusive Product &amp; Supply Requirement</h2>
  <p>Customer agrees to purchase all beverage products for use in the Equipment exclusively from Company. Customer shall not use any third-party products in the Equipment without prior written consent from Company.</p>

  <h2>6. Minimum Purchase Requirement</h2>
  <p>Customer agrees to purchase a minimum of Two Hundred Dollars ($200.00) per machine per month in beverage supplies from Company. Failure to meet this requirement may result in termination of this Agreement and removal of Equipment.</p>

  <h2>7. Product Usage Compliance</h2>
  <p>Customer shall use Company-supplied products in accordance with all applicable health, safety, and food service regulations. Customer shall maintain proper storage conditions for all beverage products.</p>

  <h2>8. Installation, Service &amp; Maintenance</h2>
  <p>Company shall provide initial installation of Equipment at no cost. Company shall provide routine maintenance and repairs. Customer shall notify Company promptly of any Equipment malfunction. Customer acknowledges responsibility for day-to-day cleaning and basic upkeep of Equipment.</p>

  <h2>9. Pricing</h2>
  <p>Company shall provide Customer with current pricing for all beverage products. Prices are subject to change with thirty (30) days written notice. Customer shall pay all invoices within thirty (30) days of receipt.</p>

  <h2>10. Default</h2>
  <p>Either party shall be in default if they fail to perform any material obligation under this Agreement and such failure continues for thirty (30) days after written notice. Upon default, the non-defaulting party may terminate this Agreement and pursue all available legal remedies.</p>

  <h2>11. Early Termination / Buyout</h2>
  <p>Customer may terminate this Agreement early by paying a buyout fee of Two Thousand Dollars ($2,000.00) per machine. Upon payment of the buyout fee, Customer may either return the Equipment or purchase it at fair market value.</p>

  <h2>12. Equipment Removal</h2>
  <p>Upon termination of this Agreement, Company shall have the right to remove all Equipment from Customer premises within thirty (30) days. Customer shall provide reasonable access for Equipment removal and shall not impede or delay such removal.</p>

  <h2>13. Limitation of Liability</h2>
  <p>IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES. COMPANY'S TOTAL LIABILITY UNDER THIS AGREEMENT SHALL NOT EXCEED THE AMOUNTS PAID BY CUSTOMER IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.</p>

  <h2>14. Governing Law</h2>
  <p>This Agreement shall be governed by and construed in accordance with the laws of the State in which the Equipment is located, without regard to conflict of law principles.</p>

  <h2>15. Entire Agreement</h2>
  <p>This Agreement constitutes the entire agreement between the parties concerning the subject matter hereof and supersedes all prior agreements, understandings, negotiations, and discussions, whether oral or written.</p>

  <h2>Acknowledgments</h2>
  <p>The Customer acknowledges each of the following by checking the corresponding boxes on the signature page:</p>
  <ul>
    <li>Customer agrees to the exclusive supply requirement.</li>
    <li>Customer acknowledges the minimum purchase requirement.</li>
    <li>Customer acknowledges responsibility for installation and maintenance obligations described in this Agreement.</li>
  </ul>

  <h2>Electronic Records &amp; Signatures</h2>
  <p>The parties consent to conduct this transaction electronically. A typed name below constitutes a valid electronic signature under the E-SIGN Act and applicable state law.</p>
  $$,
  md5(random()::text || clock_timestamp()::text)
) ON CONFLICT (agreement_type, version) DO NOTHING;

-- ─── Backfill: existing coffee-access operators get legacy_approved ─
-- Every operator whose profile shows coffee_agreement_signed=true and
-- coffee_access_enabled=true today had informally acknowledged the previous
-- checkbox. We stamp a legacy_approved user_agreements row referencing the
-- new template so they can keep ordering while we prompt them to sign the
-- real one. Idempotent — the composite unique key protects against
-- double-inserts.
DO $$
DECLARE
  coffee_template_id uuid;
BEGIN
  SELECT id INTO coffee_template_id
    FROM agreement_templates
    WHERE agreement_type = 'coffee_supply' AND version = 1
    LIMIT 1;

  IF coffee_template_id IS NULL THEN
    RAISE NOTICE 'coffee_supply v1 template missing — skipping backfill';
    RETURN;
  END IF;

  INSERT INTO user_agreements (
    user_id, agreement_template_id, agreement_type, agreement_version,
    status, admin_override_reason, countersigned_at
  )
  SELECT
    p.id,
    coffee_template_id,
    'coffee_supply',
    1,
    'legacy_approved',
    'Backfilled from pre-workflow coffee_agreement_signed flag on migration 117',
    now()
  FROM profiles p
  WHERE p.coffee_agreement_signed = true
    AND p.coffee_access_enabled = true
    AND NOT EXISTS (
      SELECT 1 FROM user_agreements ua
      WHERE ua.user_id = p.id
        AND ua.agreement_template_id = coffee_template_id
    );
END $$;
