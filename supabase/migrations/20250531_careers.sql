-- Job postings table
CREATE TABLE IF NOT EXISTS job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text NOT NULL DEFAULT '',
  hourly_rate text,
  location_type text NOT NULL DEFAULT 'remote',
  employment_type text NOT NULL DEFAULT 'full-time',
  requirements text,
  benefits text,
  active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active job postings"
  ON job_postings FOR SELECT
  USING (active = true);

-- Job applications table
CREATE TABLE IF NOT EXISTS job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id uuid NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  resume_url text,
  cover_letter text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

-- Seed the three initial job postings
INSERT INTO job_postings (title, slug, description, hourly_rate, location_type, employment_type, requirements, benefits, sort_order)
VALUES
  (
    'Remote Sales Representative',
    'remote-sales-representative',
    'Join our growing team as a Remote Sales Representative. You will be responsible for connecting vending machine operators with prime locations, building relationships with potential clients, and driving revenue growth from the comfort of your home.',
    '$15 - $22/hr + Commission',
    'remote',
    'full-time',
    '- Excellent communication and interpersonal skills
- Self-motivated with a strong work ethic
- Experience in sales, customer service, or related field preferred
- Reliable internet connection and quiet workspace
- Proficiency with CRM tools and basic computer skills',
    '- Work from anywhere
- Competitive hourly rate plus commission
- Flexible schedule
- Growth opportunities within the company
- Supportive team environment',
    1
  ),
  (
    'OTR Truck Driver',
    'otr-truck-driver',
    'We are looking for experienced OTR Truck Drivers to join our logistics team. You will be responsible for the safe and timely delivery of vending machines and supplies across the country.',
    '$25 - $32/hr',
    'on-site',
    'full-time',
    '- Valid Class A CDL
- Minimum 2 years OTR driving experience
- Clean driving record
- Ability to lift up to 75 lbs
- DOT medical card
- Willingness to travel extensively',
    '- Competitive pay
- Health insurance
- Paid time off
- Modern fleet vehicles
- Per diem for meals
- Home time every 2 weeks',
    2
  ),
  (
    'Market Sales Manager',
    'market-sales-manager',
    'Lead and grow our sales operations in your designated market area. As a Market Sales Manager, you will oversee a team of sales representatives, develop territory strategies, and build key partnerships with businesses and location owners.',
    '$55,000 - $75,000/yr + Bonus',
    'hybrid',
    'full-time',
    '- 3+ years of sales management experience
- Proven track record of meeting or exceeding sales targets
- Strong leadership and team-building skills
- Experience in vending, food service, or related industry preferred
- Valid driver''s license and reliable transportation
- Bachelor''s degree preferred',
    '- Competitive base salary plus performance bonuses
- Health, dental, and vision insurance
- 401(k) with company match
- Company vehicle or car allowance
- Professional development opportunities
- Generous PTO policy',
    3
  )
ON CONFLICT (slug) DO NOTHING;
