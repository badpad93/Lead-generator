-- VendHub Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  email text not null default '',
  avatar_url text,
  role text not null check (role in ('operator', 'location_manager', 'requestor')),
  company_name text,
  phone text,
  website text,
  bio text,
  city text,
  state text,
  zip text,
  country text not null default 'US',
  verified boolean not null default false,
  rating numeric not null default 0,
  review_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'requestor')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- ============================================================
-- VENDING REQUESTS
-- ============================================================
create table public.vending_requests (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  location_name text not null,
  address text,
  city text not null,
  state text not null,
  zip text,
  location_type text not null check (location_type in (
    'office', 'gym', 'apartment', 'school', 'hospital',
    'hotel', 'warehouse', 'retail', 'government', 'other'
  )),
  machine_types_wanted text[] not null default '{}',
  estimated_daily_traffic integer,
  commission_offered boolean not null default false,
  commission_notes text,
  urgency text not null default 'flexible' check (urgency in (
    'flexible', 'within_1_month', 'within_2_weeks', 'asap'
  )),
  status text not null default 'open' check (status in ('open', 'matched', 'closed')),
  contact_preference text not null default 'platform_message' check (contact_preference in (
    'platform_message', 'email', 'phone'
  )),
  is_public boolean not null default true,
  views integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vending_requests enable row level security;

create policy "Public requests viewable by everyone"
  on public.vending_requests for select using (is_public = true);

create policy "Owners can view own requests"
  on public.vending_requests for select using (auth.uid() = created_by);

create policy "Authenticated users can create requests"
  on public.vending_requests for insert with check (auth.uid() = created_by);

create policy "Owners can update own requests"
  on public.vending_requests for update using (auth.uid() = created_by);

create policy "Owners can delete own requests"
  on public.vending_requests for delete using (auth.uid() = created_by);

-- ============================================================
-- OPERATOR LISTINGS
-- ============================================================
create table public.operator_listings (
  id uuid primary key default uuid_generate_v4(),
  operator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  machine_types text[] not null default '{}',
  service_radius_miles integer not null default 50,
  cities_served text[] not null default '{}',
  states_served text[] not null default '{}',
  accepts_commission boolean not null default true,
  min_daily_traffic integer not null default 0,
  machine_count_available integer not null default 1,
  status text not null default 'available' check (status in ('available', 'limited', 'full')),
  featured boolean not null default false,
  views integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.operator_listings enable row level security;

create policy "Listings viewable by everyone"
  on public.operator_listings for select using (true);

create policy "Operators can create listings"
  on public.operator_listings for insert with check (auth.uid() = operator_id);

create policy "Operators can update own listings"
  on public.operator_listings for update using (auth.uid() = operator_id);

create policy "Operators can delete own listings"
  on public.operator_listings for delete using (auth.uid() = operator_id);

-- ============================================================
-- MATCHES
-- ============================================================
create table public.matches (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid not null references public.vending_requests(id) on delete cascade,
  operator_id uuid not null references public.profiles(id) on delete cascade,
  matched_by text not null default 'operator_applied' check (matched_by in (
    'platform', 'operator_applied', 'manual'
  )),
  status text not null default 'pending' check (status in (
    'pending', 'accepted', 'declined', 'installed'
  )),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(request_id, operator_id)
);

alter table public.matches enable row level security;

create policy "Involved parties can view matches"
  on public.matches for select using (
    auth.uid() = operator_id
    or auth.uid() in (
      select created_by from public.vending_requests where id = request_id
    )
  );

create policy "Operators can create matches (apply)"
  on public.matches for insert with check (auth.uid() = operator_id);

create policy "Involved parties can update matches"
  on public.matches for update using (
    auth.uid() = operator_id
    or auth.uid() in (
      select created_by from public.vending_requests where id = request_id
    )
  );

-- ============================================================
-- MESSAGES
-- ============================================================
create table public.messages (
  id uuid primary key default uuid_generate_v4(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  subject text,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "Users can view own messages"
  on public.messages for select using (
    auth.uid() = sender_id or auth.uid() = recipient_id
  );

create policy "Authenticated users can send messages"
  on public.messages for insert with check (auth.uid() = sender_id);

create policy "Recipients can mark messages read"
  on public.messages for update using (auth.uid() = recipient_id);

-- ============================================================
-- REVIEWS
-- ============================================================
create table public.reviews (
  id uuid primary key default uuid_generate_v4(),
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;

create policy "Reviews viewable by everyone"
  on public.reviews for select using (true);

create policy "Authenticated users can create reviews"
  on public.reviews for insert with check (auth.uid() = reviewer_id);

-- Auto-update profile rating on review insert
create or replace function public.update_profile_rating()
returns trigger as $$
begin
  update public.profiles
  set
    rating = (select coalesce(avg(rating), 0) from public.reviews where reviewee_id = new.reviewee_id),
    review_count = (select count(*) from public.reviews where reviewee_id = new.reviewee_id)
  where id = new.reviewee_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_review_created
  after insert on public.reviews
  for each row execute function public.update_profile_rating();

-- ============================================================
-- SAVED REQUESTS
-- ============================================================
create table public.saved_requests (
  id uuid primary key default uuid_generate_v4(),
  operator_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null references public.vending_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(operator_id, request_id)
);

alter table public.saved_requests enable row level security;

create policy "Operators can view own saved requests"
  on public.saved_requests for select using (auth.uid() = operator_id);

create policy "Operators can save requests"
  on public.saved_requests for insert with check (auth.uid() = operator_id);

create policy "Operators can unsave requests"
  on public.saved_requests for delete using (auth.uid() = operator_id);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_requests_status on public.vending_requests(status);
create index idx_requests_city_state on public.vending_requests(city, state);
create index idx_requests_created_by on public.vending_requests(created_by);
create index idx_listings_operator on public.operator_listings(operator_id);
create index idx_listings_status on public.operator_listings(status);
create index idx_matches_request on public.matches(request_id);
create index idx_matches_operator on public.matches(operator_id);
create index idx_messages_recipient on public.messages(recipient_id);
create index idx_messages_sender on public.messages(sender_id);
create index idx_reviews_reviewee on public.reviews(reviewee_id);
create index idx_saved_operator on public.saved_requests(operator_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_vending_requests_updated_at
  before update on public.vending_requests
  for each row execute function public.set_updated_at();

create trigger set_operator_listings_updated_at
  before update on public.operator_listings
  for each row execute function public.set_updated_at();

create trigger set_matches_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

-- Enable Realtime on messages
alter publication supabase_realtime add table public.messages;
