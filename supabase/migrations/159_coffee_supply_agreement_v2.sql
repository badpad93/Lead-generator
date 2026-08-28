-- Coffee Supply Agreement — version 2.
--
-- Replaces the v1 seed (migration 117) with the customer-requested
-- terms: no fixed term, customer pays shipping/installation/service,
-- 15-day return window at customer expense on termination, damaged
-- product is customer's responsibility, no refunds, 30-day fulfillment
-- window, and a drop-ship-to-consumer carve-out where the company
-- retains fulfillment responsibility.
--
-- Existing signers of v1 keep their v1 user_agreements row (history is
-- preserved). Anyone visiting /coffee/agreement after this migration
-- will see + sign v2 because getActiveTemplate() picks whichever
-- agreement_templates row for the type is currently is_active.

-- Deactivate v1 so getActiveTemplate('coffee_supply') returns v2.
UPDATE agreement_templates
   SET is_active = false
 WHERE agreement_type = 'coffee_supply'
   AND version = 1;

INSERT INTO agreement_templates (
  agreement_type, version, title, effective_date, is_active, content_html, content_hash
) VALUES (
  'coffee_supply',
  2,
  'Apex AI Vending — Equipment Loan & Beverage Supply Agreement',
  CURRENT_DATE,
  true,
  $$
  <h1>Apex AI Vending — Equipment Loan &amp; Beverage Supply Agreement</h1>
  <p><em>the apex of retail innovation</em></p>

  <h2>1. Parties</h2>
  <p>This Equipment Loan and Beverage Supply Agreement ("Agreement") is entered into by and between Apex AI Vending ("Company") and the Customer identified on the signature page below.</p>

  <h2>2. Term</h2>
  <p>This Agreement has no fixed term. It remains in effect from the Effective Date until terminated by either party in writing.</p>

  <h2>3. Shipping, Installation &amp; Service Costs</h2>
  <p>Customer is responsible for all costs of shipping, installation, and service related to the Equipment. Company will coordinate logistics on Customer's behalf; costs will be invoiced to and paid by Customer.</p>

  <h2>4. Equipment Loan</h2>
  <p>Company agrees to provide Customer with beverage vending equipment ("Equipment") at no purchase cost, subject to the terms and conditions of this Agreement. The number of machines is specified on the signature page below. Title to the Equipment remains with Company throughout the duration of this Agreement.</p>

  <h2>5. Exclusive Product &amp; Supply Requirement</h2>
  <p>Customer agrees to purchase all beverage products for use in the Equipment exclusively from Company. Customer shall not use any third-party products in the Equipment without prior written consent from Company.</p>

  <h2>6. Minimum Purchase Requirement</h2>
  <p>Customer agrees to purchase a minimum of Two Hundred Dollars ($200.00) per machine per month in beverage supplies from Company. Failure to meet this requirement may result in termination of this Agreement and removal of Equipment.</p>

  <h2>7. Product Usage Compliance</h2>
  <p>Customer shall use Company-supplied products in accordance with all applicable health, safety, and food service regulations. Customer shall maintain proper storage conditions for all beverage products.</p>

  <h2>8. Order Fulfillment Window</h2>
  <p>Company shall fulfill each order within thirty (30) days of receipt of the order, measured from order receipt to delivery.</p>

  <h2>9. Damaged Product</h2>
  <p>Any product damaged after delivery is the sole responsibility of Customer. No credit, replacement, or refund will be issued for product damaged in Customer's possession.</p>

  <h2>10. No Refunds</h2>
  <p>All sales of beverage products and supplies are final. No refunds will be issued.</p>

  <h2>11. Drop-Shipment to Direct Consumers</h2>
  <p>Where product is drop-shipped by Company directly to an end consumer at Customer's direction, that product is non-refundable to Customer, and Company retains responsibility for the fulfillment and delivery of that shipment to the end consumer.</p>

  <h2>12. Pricing</h2>
  <p>Company shall provide Customer with current pricing for all beverage products. Prices are subject to change with thirty (30) days written notice. Customer shall pay all invoices within thirty (30) days of receipt.</p>

  <h2>13. Termination</h2>
  <p>Either party may terminate this Agreement in writing at any time. Upon termination, Customer is responsible for shipping all Equipment back to Company at Customer's expense within fifteen (15) days of the termination date. Failure to return the Equipment within that window may result in Customer being invoiced for the Equipment's fair market replacement value.</p>

  <h2>14. Limitation of Liability</h2>
  <p>IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES. COMPANY'S TOTAL LIABILITY UNDER THIS AGREEMENT SHALL NOT EXCEED THE AMOUNTS PAID BY CUSTOMER IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.</p>

  <h2>15. Governing Law</h2>
  <p>This Agreement shall be governed by and construed in accordance with the laws of the State in which the Equipment is located, without regard to conflict of law principles.</p>

  <h2>16. Entire Agreement</h2>
  <p>This Agreement constitutes the entire agreement between the parties concerning the subject matter hereof and supersedes all prior agreements, understandings, negotiations, and discussions, whether oral or written.</p>

  <h2>Acknowledgments</h2>
  <p>The Customer acknowledges each of the following by checking the corresponding boxes on the signature page:</p>
  <ul>
    <li>Customer agrees to the exclusive supply requirement.</li>
    <li>Customer acknowledges the minimum purchase requirement.</li>
    <li>Customer acknowledges responsibility for shipping, installation, and service costs, and for returning the Equipment at Customer's expense within fifteen (15) days of termination.</li>
  </ul>

  <h2>Electronic Records &amp; Signatures</h2>
  <p>The parties consent to conduct this transaction electronically. A typed name below constitutes a valid electronic signature under the E-SIGN Act and applicable state law.</p>
  $$,
  md5(random()::text || clock_timestamp()::text)
) ON CONFLICT (agreement_type, version) DO NOTHING;
