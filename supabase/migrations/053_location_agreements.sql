-- Location Intent Agreements
-- Sent to location decision makers when a lead is qualified.
-- Once signed, the agreement is stored and released to operators after payment.

create table if not exists location_agreements (
  id uuid primary key default gen_random_uuid(),
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  lead_id uuid references sales_leads(id),
  status text not null default 'pending' check (status in ('pending','viewed','signed')),

  -- Business info (pre-filled from lead, editable by signer)
  business_name text,
  contact_name text,
  title_role text,
  email text,
  phone text,
  address text,

  -- Signature
  signature_name text,
  signature_ip text,
  signed_at timestamptz,

  -- Checkboxes
  confirm_accurate boolean default false,
  confirm_authorized boolean default false,
  confirm_agree boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table location_agreements enable row level security;
create policy "Service role full access" on location_agreements for all using (true) with check (true);

-- Index for token lookups
create index if not exists idx_location_agreements_token on location_agreements(token);
create index if not exists idx_location_agreements_lead on location_agreements(lead_id);
