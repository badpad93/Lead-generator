-- Non-Circumvention Agreements
-- Sent to operators before sharing confidential location details.
-- Once signed, a copy is emailed to james@apexaivending.com.

create table if not exists non_circumvention_agreements (
  id uuid primary key default gen_random_uuid(),
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  lead_id uuid references sales_leads(id),
  status text not null default 'pending' check (status in ('pending','viewed','signed')),

  -- Operator info (pre-filled from lead, editable by signer)
  operator_name text,
  company_name text,
  email text,
  phone text,
  address text,

  -- Signature
  signature_name text,
  signature_ip text,
  signed_at timestamptz,

  -- Confirmations
  confirm_confidential boolean default false,
  confirm_no_circumvent boolean default false,
  confirm_consequences boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table non_circumvention_agreements enable row level security;
create policy "Service role full access" on non_circumvention_agreements for all using (true) with check (true);

-- Indexes
create index if not exists idx_nca_token on non_circumvention_agreements(token);
create index if not exists idx_nca_lead on non_circumvention_agreements(lead_id);
