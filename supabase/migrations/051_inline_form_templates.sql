-- Migration 051: Inline form templates
-- Adds JSONB fields schema to document_templates so candidates can fill out
-- forms directly in the portal instead of downloading/uploading PDFs.
-- Also adds form_data JSONB to candidate_documents to store completed form responses.

-- ============================================================
-- 1. ADD form_fields TO document_templates
-- JSON array defining fillable fields for each template
-- ============================================================
ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS form_fields JSONB,
  ADD COLUMN IF NOT EXISTS form_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ============================================================
-- 2. ADD form_data TO candidate_documents
-- Stores the candidate's filled-in form responses as JSON
-- ============================================================
ALTER TABLE public.candidate_documents
  ADD COLUMN IF NOT EXISTS form_data JSONB;

-- ============================================================
-- 3. SEED common onboarding document templates with form fields
-- These are created as form-enabled templates. Admins can also
-- upload PDF-only templates alongside these.
-- ============================================================

-- Interview step templates
INSERT INTO public.document_templates (name, pipeline_type, step_key, file_path, file_name, mime_type, form_enabled, description, form_fields) VALUES

-- NDA
('Non-Disclosure Agreement', 'ALL', 'interview', 'forms/nda', 'NDA.pdf', 'application/pdf', true,
 'Protects confidential business information shared during the onboarding process.',
 '[
   {"key": "full_name", "label": "Full Legal Name", "type": "text", "required": true, "placeholder": "e.g. John A. Smith"},
   {"key": "address", "label": "Mailing Address", "type": "text", "required": true, "placeholder": "123 Main St, City, State ZIP"},
   {"key": "email", "label": "Email Address", "type": "email", "required": true, "placeholder": "john@example.com"},
   {"key": "phone", "label": "Phone Number", "type": "phone", "required": true, "placeholder": "(555) 123-4567"},
   {"key": "effective_date", "label": "Effective Date", "type": "date", "required": true},
   {"key": "agree_terms", "label": "I agree to keep all proprietary and confidential information strictly confidential and not disclose it to any third party.", "type": "checkbox", "required": true},
   {"key": "signature", "label": "Signature", "type": "signature", "required": true, "placeholder": "Type your full legal name to sign"},
   {"key": "signed_date", "label": "Date Signed", "type": "date", "required": true}
 ]'::jsonb),

-- NCA (Non-Compete Agreement)
('Non-Compete Agreement', 'ALL', 'interview', 'forms/nca', 'NCA.pdf', 'application/pdf', true,
 'Restricts competitive activities during and after the business relationship.',
 '[
   {"key": "full_name", "label": "Full Legal Name", "type": "text", "required": true, "placeholder": "e.g. John A. Smith"},
   {"key": "address", "label": "Mailing Address", "type": "text", "required": true, "placeholder": "123 Main St, City, State ZIP"},
   {"key": "email", "label": "Email Address", "type": "email", "required": true, "placeholder": "john@example.com"},
   {"key": "effective_date", "label": "Effective Date", "type": "date", "required": true},
   {"key": "territory", "label": "Territory / Market Area", "type": "text", "required": false, "placeholder": "e.g. Greater Chicago Area"},
   {"key": "agree_terms", "label": "I agree not to engage in competing business activities within the specified territory for the duration of this agreement.", "type": "checkbox", "required": true},
   {"key": "signature", "label": "Signature", "type": "signature", "required": true, "placeholder": "Type your full legal name to sign"},
   {"key": "signed_date", "label": "Date Signed", "type": "date", "required": true}
 ]'::jsonb),

-- Independent Contractor Agreement
('Independent Contractor Agreement', 'ALL', 'interview', 'forms/ica', 'ICA.pdf', 'application/pdf', true,
 'Defines the working relationship, compensation, and responsibilities.',
 '[
   {"key": "full_name", "label": "Full Legal Name", "type": "text", "required": true, "placeholder": "e.g. John A. Smith"},
   {"key": "business_name", "label": "Business Name (if applicable)", "type": "text", "required": false, "placeholder": "e.g. Smith Vending LLC"},
   {"key": "address", "label": "Mailing Address", "type": "text", "required": true, "placeholder": "123 Main St, City, State ZIP"},
   {"key": "email", "label": "Email Address", "type": "email", "required": true, "placeholder": "john@example.com"},
   {"key": "phone", "label": "Phone Number", "type": "phone", "required": true, "placeholder": "(555) 123-4567"},
   {"key": "ssn_ein", "label": "SSN or EIN", "type": "sensitive", "required": true, "placeholder": "XXX-XX-XXXX or XX-XXXXXXX"},
   {"key": "start_date", "label": "Start Date", "type": "date", "required": true},
   {"key": "agree_terms", "label": "I acknowledge that I am an independent contractor and not an employee. I am responsible for my own taxes, insurance, and business expenses.", "type": "checkbox", "required": true},
   {"key": "signature", "label": "Signature", "type": "signature", "required": true, "placeholder": "Type your full legal name to sign"},
   {"key": "signed_date", "label": "Date Signed", "type": "date", "required": true}
 ]'::jsonb),

-- Welcome docs step templates

-- W9 Tax Form
('W-9 Tax Information', 'ALL', 'welcome_docs', 'forms/w9', 'W9.pdf', 'application/pdf', true,
 'Required tax identification form for independent contractors.',
 '[
   {"key": "full_name", "label": "Full Legal Name (as shown on your tax return)", "type": "text", "required": true, "placeholder": "e.g. John A. Smith"},
   {"key": "business_name", "label": "Business Name / DBA (if different)", "type": "text", "required": false, "placeholder": "e.g. Smith Vending LLC"},
   {"key": "tax_classification", "label": "Federal Tax Classification", "type": "select", "required": true, "options": ["Individual/Sole Proprietor", "Single-Member LLC", "C Corporation", "S Corporation", "Partnership", "Trust/Estate", "LLC - C Corp", "LLC - S Corp", "LLC - Partnership"]},
   {"key": "address", "label": "Street Address", "type": "text", "required": true, "placeholder": "123 Main St"},
   {"key": "city_state_zip", "label": "City, State, and ZIP Code", "type": "text", "required": true, "placeholder": "Chicago, IL 60601"},
   {"key": "ssn_ein", "label": "Taxpayer Identification Number (SSN or EIN)", "type": "sensitive", "required": true, "placeholder": "XXX-XX-XXXX or XX-XXXXXXX"},
   {"key": "exempt_payee", "label": "Exempt Payee Code (if applicable)", "type": "text", "required": false, "placeholder": "Leave blank if not applicable"},
   {"key": "agree_certification", "label": "Under penalties of perjury, I certify that the number shown on this form is my correct taxpayer identification number, and I am not subject to backup withholding.", "type": "checkbox", "required": true},
   {"key": "signature", "label": "Signature", "type": "signature", "required": true, "placeholder": "Type your full legal name to sign"},
   {"key": "signed_date", "label": "Date Signed", "type": "date", "required": true}
 ]'::jsonb),

-- ACH Direct Deposit Form
('ACH Direct Deposit Authorization', 'ALL', 'welcome_docs', 'forms/ach', 'ACH.pdf', 'application/pdf', true,
 'Authorize direct deposit payments to your bank account.',
 '[
   {"key": "full_name", "label": "Account Holder Name", "type": "text", "required": true, "placeholder": "e.g. John A. Smith"},
   {"key": "bank_name", "label": "Bank Name", "type": "text", "required": true, "placeholder": "e.g. Chase Bank"},
   {"key": "account_type", "label": "Account Type", "type": "select", "required": true, "options": ["Checking", "Savings"]},
   {"key": "routing_number", "label": "Routing Number (9 digits)", "type": "text", "required": true, "placeholder": "XXXXXXXXX"},
   {"key": "account_number", "label": "Account Number", "type": "sensitive", "required": true, "placeholder": "Enter your account number"},
   {"key": "confirm_account_number", "label": "Confirm Account Number", "type": "sensitive", "required": true, "placeholder": "Re-enter your account number"},
   {"key": "agree_terms", "label": "I authorize Vending Connector to initiate direct deposit payments to the bank account listed above. This authorization remains in effect until I provide written notice of cancellation.", "type": "checkbox", "required": true},
   {"key": "signature", "label": "Signature", "type": "signature", "required": true, "placeholder": "Type your full legal name to sign"},
   {"key": "signed_date", "label": "Date Signed", "type": "date", "required": true}
 ]'::jsonb)

ON CONFLICT DO NOTHING;
