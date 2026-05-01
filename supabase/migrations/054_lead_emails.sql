-- Track emails sent to leads
CREATE TABLE IF NOT EXISTS lead_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES sales_leads(id) ON DELETE CASCADE,
  sent_by uuid REFERENCES auth.users(id),
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  template_name text,
  status text NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_emails_lead_id ON lead_emails(lead_id);
CREATE INDEX idx_lead_emails_sent_by ON lead_emails(sent_by);
