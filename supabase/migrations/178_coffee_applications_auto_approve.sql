-- ==========================================================
-- Coffee applications: no review step.
--
-- Applications now auto-approve at submission (the /api/coffee/apply
-- route inserts status='approved' and enables marketplace access
-- immediately). This migration unsticks every account that was
-- already parked in the old pending state so nobody stays stranded
-- on the retired "Application Under Review" screen.
--
-- reviewed_by stays NULL on rows flipped here — same convention the
-- auto-approval route uses, so human reviews remain distinguishable
-- in the admin console.
--
-- coffee_agreement_signed is intentionally NOT touched: the
-- Equipment Loan & Beverage Supply Agreement is a real signing step
-- and stays gated on the actual signature flow.
-- ==========================================================

UPDATE coffee_applications
   SET status = 'approved',
       reviewed_at = now()
 WHERE status = 'pending';

UPDATE profiles
   SET coffee_application_status = 'approved',
       coffee_access_enabled = true
 WHERE coffee_application_status = 'pending';
