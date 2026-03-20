-- ============================================================
-- LEAD PURCHASES (per-lead Stripe payments)
-- ============================================================
create table public.lead_purchases (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null references public.vending_requests(id) on delete cascade,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  amount_cents integer not null,
  currency text not null default 'usd',
  status text not null default 'pending' check (status in (
    'pending', 'completed', 'failed', 'refunded'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, request_id)
);

alter table public.lead_purchases enable row level security;

create policy "Users can view own purchases"
  on public.lead_purchases for select using (auth.uid() = user_id);

create index idx_lead_purchases_user on public.lead_purchases(user_id);
create index idx_lead_purchases_request on public.lead_purchases(request_id);
create index idx_lead_purchases_session on public.lead_purchases(stripe_checkout_session_id);

create trigger set_lead_purchases_updated_at
  before update on public.lead_purchases
  for each row execute function public.set_updated_at();
