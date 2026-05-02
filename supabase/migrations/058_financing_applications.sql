CREATE TABLE IF NOT EXISTS financing_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  date_of_birth text,
  citizenship_status text,
  credit_score_range text,
  net_worth_range text,
  annual_income text,
  has_verifiable_income boolean DEFAULT false,
  has_tax_liens boolean DEFAULT false,
  has_bankruptcy boolean DEFAULT false,
  has_judgments boolean DEFAULT false,
  has_felony boolean DEFAULT false,
  has_legal_actions boolean DEFAULT false,
  has_federal_debt boolean DEFAULT false,
  agreed_provide_docs boolean DEFAULT false,
  agreed_accurate_info boolean DEFAULT false,
  status text DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewing', 'approved', 'denied')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE financing_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own applications"
  ON financing_applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own applications"
  ON financing_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);
