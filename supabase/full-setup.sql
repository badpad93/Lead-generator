-- ==========================================================================
-- Vending Connector: FULL DATABASE SETUP
-- Run this in Supabase SQL Editor (single execution)
-- Creates all tables, RLS policies, triggers, indexes, and seeds data
-- ==========================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- Step 1: ALTER existing profiles table to match expected schema
-- (adds columns that may be missing)
-- ============================================================
DO $$
BEGIN
  -- Add missing columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='avatar_url') THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='role') THEN
    ALTER TABLE public.profiles ADD COLUMN role text NOT NULL DEFAULT 'requestor' CHECK (role IN ('operator', 'location_manager', 'requestor'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='company_name') THEN
    ALTER TABLE public.profiles ADD COLUMN company_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='phone') THEN
    ALTER TABLE public.profiles ADD COLUMN phone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='website') THEN
    ALTER TABLE public.profiles ADD COLUMN website text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='bio') THEN
    ALTER TABLE public.profiles ADD COLUMN bio text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='city') THEN
    ALTER TABLE public.profiles ADD COLUMN city text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='state') THEN
    ALTER TABLE public.profiles ADD COLUMN state text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='zip') THEN
    ALTER TABLE public.profiles ADD COLUMN zip text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='country') THEN
    ALTER TABLE public.profiles ADD COLUMN country text NOT NULL DEFAULT 'US';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='verified') THEN
    ALTER TABLE public.profiles ADD COLUMN verified boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='rating') THEN
    ALTER TABLE public.profiles ADD COLUMN rating numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='review_count') THEN
    ALTER TABLE public.profiles ADD COLUMN review_count integer NOT NULL DEFAULT 0;
  END IF;
END
$$;

-- ============================================================
-- Step 2: Create handle_new_user trigger (skip if exists)
-- ============================================================
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS for profiles
alter table public.profiles enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Public profiles are viewable by everyone') THEN
    CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can update own profile') THEN
    CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
  END IF;
END
$$;

-- ============================================================
-- Step 3: Create set_updated_at function (used by triggers)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- Step 4: Create VENDING_REQUESTS table
-- ============================================================
create table if not exists public.vending_requests (
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vending_requests' AND policyname='Public requests viewable by everyone') THEN
    CREATE POLICY "Public requests viewable by everyone" ON public.vending_requests FOR SELECT USING (is_public = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vending_requests' AND policyname='Owners can view own requests') THEN
    CREATE POLICY "Owners can view own requests" ON public.vending_requests FOR SELECT USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vending_requests' AND policyname='Authenticated users can create requests') THEN
    CREATE POLICY "Authenticated users can create requests" ON public.vending_requests FOR INSERT WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vending_requests' AND policyname='Owners can update own requests') THEN
    CREATE POLICY "Owners can update own requests" ON public.vending_requests FOR UPDATE USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vending_requests' AND policyname='Owners can delete own requests') THEN
    CREATE POLICY "Owners can delete own requests" ON public.vending_requests FOR DELETE USING (auth.uid() = created_by);
  END IF;
END
$$;

DROP TRIGGER IF EXISTS set_vending_requests_updated_at ON public.vending_requests;
create trigger set_vending_requests_updated_at
  before update on public.vending_requests
  for each row execute function public.set_updated_at();

-- ============================================================
-- Step 5: Create OPERATOR_LISTINGS table
-- ============================================================
create table if not exists public.operator_listings (
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='operator_listings' AND policyname='Listings viewable by everyone') THEN
    CREATE POLICY "Listings viewable by everyone" ON public.operator_listings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='operator_listings' AND policyname='Operators can create listings') THEN
    CREATE POLICY "Operators can create listings" ON public.operator_listings FOR INSERT WITH CHECK (auth.uid() = operator_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='operator_listings' AND policyname='Operators can update own listings') THEN
    CREATE POLICY "Operators can update own listings" ON public.operator_listings FOR UPDATE USING (auth.uid() = operator_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='operator_listings' AND policyname='Operators can delete own listings') THEN
    CREATE POLICY "Operators can delete own listings" ON public.operator_listings FOR DELETE USING (auth.uid() = operator_id);
  END IF;
END
$$;

DROP TRIGGER IF EXISTS set_operator_listings_updated_at ON public.operator_listings;
create trigger set_operator_listings_updated_at
  before update on public.operator_listings
  for each row execute function public.set_updated_at();

-- ============================================================
-- Step 6: Create MATCHES table
-- ============================================================
create table if not exists public.matches (
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='matches' AND policyname='Involved parties can view matches') THEN
    CREATE POLICY "Involved parties can view matches" ON public.matches FOR SELECT USING (
      auth.uid() = operator_id
      OR auth.uid() IN (SELECT created_by FROM public.vending_requests WHERE id = request_id)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='matches' AND policyname='Operators can create matches (apply)') THEN
    CREATE POLICY "Operators can create matches (apply)" ON public.matches FOR INSERT WITH CHECK (auth.uid() = operator_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='matches' AND policyname='Involved parties can update matches') THEN
    CREATE POLICY "Involved parties can update matches" ON public.matches FOR UPDATE USING (
      auth.uid() = operator_id
      OR auth.uid() IN (SELECT created_by FROM public.vending_requests WHERE id = request_id)
    );
  END IF;
END
$$;

DROP TRIGGER IF EXISTS set_matches_updated_at ON public.matches;
create trigger set_matches_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

-- ============================================================
-- Step 7: Create REVIEWS table
-- ============================================================
create table if not exists public.reviews (
  id uuid primary key default uuid_generate_v4(),
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reviews' AND policyname='Reviews viewable by everyone') THEN
    CREATE POLICY "Reviews viewable by everyone" ON public.reviews FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reviews' AND policyname='Authenticated users can create reviews') THEN
    CREATE POLICY "Authenticated users can create reviews" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);
  END IF;
END
$$;

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

DROP TRIGGER IF EXISTS on_review_created ON public.reviews;
create trigger on_review_created
  after insert on public.reviews
  for each row execute function public.update_profile_rating();

-- ============================================================
-- Step 8: Create SAVED_REQUESTS table
-- ============================================================
create table if not exists public.saved_requests (
  id uuid primary key default uuid_generate_v4(),
  operator_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null references public.vending_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(operator_id, request_id)
);

alter table public.saved_requests enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_requests' AND policyname='Operators can view own saved requests') THEN
    CREATE POLICY "Operators can view own saved requests" ON public.saved_requests FOR SELECT USING (auth.uid() = operator_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_requests' AND policyname='Operators can save requests') THEN
    CREATE POLICY "Operators can save requests" ON public.saved_requests FOR INSERT WITH CHECK (auth.uid() = operator_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_requests' AND policyname='Operators can unsave requests') THEN
    CREATE POLICY "Operators can unsave requests" ON public.saved_requests FOR DELETE USING (auth.uid() = operator_id);
  END IF;
END
$$;

-- ============================================================
-- Step 9: Create ROUTE_LISTINGS table
-- ============================================================
create table if not exists public.route_listings (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  city text not null,
  state text not null,
  num_machines integer not null,
  num_locations integer not null,
  monthly_revenue numeric,
  asking_price numeric,
  machine_types text[] not null default '{}',
  location_types text[] not null default '{}',
  includes_equipment boolean not null default true,
  includes_contracts boolean not null default true,
  contact_email text,
  contact_phone text,
  status text not null default 'active' check (status in ('active', 'sold', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.route_listings enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='route_listings' AND policyname='Route listings viewable by everyone') THEN
    CREATE POLICY "Route listings viewable by everyone" ON public.route_listings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='route_listings' AND policyname='Authenticated users can create route listings') THEN
    CREATE POLICY "Authenticated users can create route listings" ON public.route_listings FOR INSERT WITH CHECK (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='route_listings' AND policyname='Owners can update own route listings') THEN
    CREATE POLICY "Owners can update own route listings" ON public.route_listings FOR UPDATE USING (auth.uid() = created_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='route_listings' AND policyname='Owners can delete own route listings') THEN
    CREATE POLICY "Owners can delete own route listings" ON public.route_listings FOR DELETE USING (auth.uid() = created_by);
  END IF;
END
$$;

DROP TRIGGER IF EXISTS set_route_listings_updated_at ON public.route_listings;
create trigger set_route_listings_updated_at
  before update on public.route_listings
  for each row execute function public.set_updated_at();

-- ============================================================
-- Step 10: Create SUBSCRIPTIONS table
-- ============================================================
create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  status text not null default 'incomplete' check (status in (
    'active', 'past_due', 'canceled', 'incomplete', 'trialing', 'unpaid'
  )),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id),
  unique(stripe_customer_id),
  unique(stripe_subscription_id)
);

alter table public.subscriptions enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='Users can view own subscription') THEN
    CREATE POLICY "Users can view own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
  END IF;
END
$$;

DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON public.subscriptions;
create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ============================================================
-- Step 11: Storage bucket for avatars
-- ============================================================
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Avatar images are publicly accessible') THEN
    CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Users can upload own avatar') THEN
    CREATE POLICY "Users can upload own avatar" ON storage.objects FOR INSERT WITH CHECK (
      bucket_id = 'avatars' AND auth.role() = 'authenticated' AND (storage.foldername(name))[1] IS NULL AND starts_with(name, auth.uid()::text)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Users can update own avatar') THEN
    CREATE POLICY "Users can update own avatar" ON storage.objects FOR UPDATE USING (
      bucket_id = 'avatars' AND auth.role() = 'authenticated' AND starts_with(name, auth.uid()::text)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Users can delete own avatar') THEN
    CREATE POLICY "Users can delete own avatar" ON storage.objects FOR DELETE USING (
      bucket_id = 'avatars' AND auth.role() = 'authenticated' AND starts_with(name, auth.uid()::text)
    );
  END IF;
END
$$;

-- ============================================================
-- Step 12: Indexes
-- ============================================================
create index if not exists idx_requests_status on public.vending_requests(status);
create index if not exists idx_requests_city_state on public.vending_requests(city, state);
create index if not exists idx_requests_created_by on public.vending_requests(created_by);
create index if not exists idx_listings_operator on public.operator_listings(operator_id);
create index if not exists idx_listings_status on public.operator_listings(status);
create index if not exists idx_matches_request on public.matches(request_id);
create index if not exists idx_matches_operator on public.matches(operator_id);
create index if not exists idx_reviews_reviewee on public.reviews(reviewee_id);
create index if not exists idx_saved_operator on public.saved_requests(operator_id);
create index if not exists idx_route_listings_created_by on public.route_listings(created_by);
create index if not exists idx_route_listings_status on public.route_listings(status);
create index if not exists idx_subscriptions_user on public.subscriptions(user_id);
create index if not exists idx_subscriptions_stripe_customer on public.subscriptions(stripe_customer_id);


-- ============================================================
-- Step 13: SEED DATA - Demo profiles, requests, listings, etc.
-- ============================================================

-- Vending Connector Seed Data
-- Run this AFTER schema.sql in Supabase SQL Editor
-- Note: These use fixed UUIDs so foreign keys work. In production, these would
-- be created through the auth flow.

-- ============================================================
-- PROFILES (5 operators + 5 location managers/requestors)
-- ============================================================

-- Operators
INSERT INTO public.profiles (id, full_name, email, role, company_name, phone, bio, city, state, zip, verified, rating, review_count) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Sarah Martinez', 'sarah@vendpro.com', 'operator', 'VendPro Solutions', '(602) 555-0101', 'Family-owned vending business serving the Phoenix metro area for 15+ years. We specialize in healthy and combo machines for offices and gyms.', 'Phoenix', 'AZ', '85001', true, 4.8, 12),
  ('22222222-2222-2222-2222-222222222222', 'Marcus Johnson', 'marcus@snackking.com', 'operator', 'Snack King Vending', '(214) 555-0202', 'Full-service vending operator covering all of Texas. 200+ machines deployed. Snack, beverage, and combo machines available.', 'Dallas', 'TX', '75201', true, 4.5, 8),
  ('33333333-3333-3333-3333-333333333333', 'Emily Chen', 'emily@greenvend.com', 'operator', 'GreenVend Co.', '(303) 555-0303', 'Eco-friendly vending focused on healthy, organic, and fresh food options. Serving Colorado and neighboring states.', 'Denver', 'CO', '80202', true, 4.9, 15),
  ('44444444-4444-4444-4444-444444444444', 'Robert Williams', 'robert@coffeevend.com', 'operator', 'CoffeeVend Express', '(212) 555-0404', 'Premium coffee and hot beverage vending machines. Serving the entire Northeast. Bean-to-cup machines with fresh milk options.', 'New York', 'NY', '10001', true, 4.3, 6),
  ('55555555-5555-5555-5555-555555555555', 'Lisa Thompson', 'lisa@vendall.com', 'operator', 'VendAll Services', '(404) 555-0505', 'We do it all — snack, beverage, combo, frozen, and specialty machines. Southeast coverage with 500+ active locations.', 'Atlanta', 'GA', '30301', false, 4.6, 10);

-- Location Managers & Requestors
INSERT INTO public.profiles (id, full_name, email, role, company_name, phone, bio, city, state, zip, verified, rating, review_count) VALUES
  ('66666666-6666-6666-6666-666666666666', 'James Turner', 'james@abccorp.com', 'location_manager', 'ABC Corporation', '(602) 555-0601', 'Facilities manager for a 3-building office complex in downtown Phoenix.', 'Phoenix', 'AZ', '85003', false, 0, 0),
  ('77777777-7777-7777-7777-777777777777', 'Amanda Rodriguez', 'amanda@fitzone.com', 'location_manager', 'FitZone Gyms', '(214) 555-0701', 'Owner of 4 gym locations across the Dallas-Fort Worth area.', 'Dallas', 'TX', '75201', false, 0, 0),
  ('88888888-8888-8888-8888-888888888888', 'David Kim', 'david@unihousing.edu', 'location_manager', 'State University Housing', '(303) 555-0801', 'Director of residential life overseeing 12 dorm buildings.', 'Denver', 'CO', '80210', false, 0, 0),
  ('99999999-9999-9999-9999-999999999999', 'Patricia Moore', 'patricia@gmail.com', 'requestor', NULL, '(212) 555-0901', 'Office worker who wants better snack options in our building lobby.', 'New York', 'NY', '10016', false, 0, 0),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kevin Brown', 'kevin@gmail.com', 'requestor', NULL, '(404) 555-1001', 'Apartment tenant who thinks the building needs a vending machine.', 'Atlanta', 'GA', '30308', false, 0, 0);

-- ============================================================
-- VENDING REQUESTS (10 requests)
-- ============================================================
INSERT INTO public.vending_requests (id, created_by, title, description, location_name, address, city, state, zip, location_type, machine_types_wanted, estimated_daily_traffic, commission_offered, commission_notes, urgency, status, contact_preference, is_public, views) VALUES
  ('req-11111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'Need snack & beverage machines for 3-story office', 'Our office building has 400+ employees across 3 floors. Looking for 2-3 machines (snack + beverage combo). High traffic break rooms on each floor. Building is open 7am-8pm weekdays.', 'ABC Corp - Downtown Phoenix', '123 Central Ave', 'Phoenix', 'AZ', '85003', 'office', '{snack,beverage,combo}', 400, true, '15% of gross revenue monthly', 'within_1_month', 'open', 'platform_message', true, 145),

  ('req-22222-2222-2222-2222-222222222222', '77777777-7777-7777-7777-777777777777', 'Healthy vending for fitness center chain', 'We run 4 gym locations and need healthy vending options at each. Looking for protein bars, healthy snacks, sports drinks, and water. Members frequently ask for these.', 'FitZone Gyms - Main Location', '456 Elm St', 'Dallas', 'TX', '75201', 'gym', '{healthy,beverage}', 600, true, '10% commission + we provide the space rent-free', 'asap', 'open', 'email', true, 230),

  ('req-33333-3333-3333-3333-333333333333', '88888888-8888-8888-8888-888888888888', 'Vending machines for university dorm buildings', 'Need machines in 12 dorm building lobbies. Mix of snack, beverage, and late-night options. 5,000+ students on campus. Machines must accept card payments.', 'State University - Residence Halls', '789 University Blvd', 'Denver', 'CO', '80210', 'school', '{snack,beverage,combo,fresh_food}', 5000, true, 'Standard university commission rates (12%)', 'within_2_weeks', 'open', 'platform_message', true, 412),

  ('req-44444-4444-4444-4444-444444444444', '99999999-9999-9999-9999-999999999999', 'Coffee machine needed in office lobby', 'Our building has 200+ people and no coffee option nearby. The lobby area has space and power outlet ready. Would love a premium bean-to-cup machine.', 'Midtown Office Tower - Lobby', '321 5th Ave', 'New York', 'NY', '10016', 'office', '{coffee}', 200, false, NULL, 'flexible', 'open', 'platform_message', true, 87),

  ('req-55555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Snack machine for apartment building lobby', 'Our apartment building has 150 units but no vending machine. The lobby has a perfect spot next to the mailboxes. Lots of foot traffic especially evenings.', 'The Heights Apartments', '555 Peachtree Rd', 'Atlanta', 'GA', '30308', 'apartment', '{snack,beverage}', 150, false, NULL, 'flexible', 'open', 'phone', true, 56),

  ('req-66666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666', 'Frozen treats machine for office break room', 'Summer is coming and our employees have been requesting ice cream and frozen treats. Break room has space for a small frozen vending unit.', 'ABC Corp - Building B', '125 Central Ave', 'Phoenix', 'AZ', '85003', 'office', '{frozen}', 400, true, '10% monthly', 'within_1_month', 'open', 'platform_message', true, 34),

  ('req-77777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777', 'PPE vending for warehouse facility', 'Need a PPE/safety equipment vending machine for our distribution warehouse. Must dispense gloves, safety glasses, ear plugs, dust masks. 24/7 operation.', 'FitZone Distribution Center', '789 Industrial Blvd', 'Dallas', 'TX', '75212', 'warehouse', '{personal_care}', 100, true, 'Flat rate $200/month', 'asap', 'matched', 'phone', true, 178),

  ('req-88888-8888-8888-8888-888888888888', '88888888-8888-8888-8888-888888888888', 'Electronics accessories for student center', 'Students always need phone chargers, earbuds, and adapters. Want a tech vending machine in the student center. High traffic area near food court.', 'State University - Student Center', '790 University Blvd', 'Denver', 'CO', '80210', 'school', '{electronics}', 3000, false, NULL, 'within_1_month', 'open', 'platform_message', true, 95),

  ('req-99999-9999-9999-9999-999999999999', '66666666-6666-6666-6666-666666666666', 'Full-service vending for new hospital wing', 'New hospital wing opening next month. Need snack, beverage, and fresh food options for waiting areas and staff lounges. 3 locations within the wing.', 'Phoenix General Hospital - East Wing', '900 Medical Dr', 'Phoenix', 'AZ', '85006', 'hospital', '{snack,beverage,fresh_food,coffee}', 800, true, '8% of revenue', 'within_2_weeks', 'open', 'platform_message', true, 267),

  ('req-aaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Vending machine for hotel lobby', 'Small boutique hotel with 50 rooms. Guests often ask where to get snacks late at night. A combo machine in the lobby would be perfect.', 'The Peach Hotel', '100 Auburn Ave', 'Atlanta', 'GA', '30303', 'hotel', '{snack,beverage,combo}', 50, true, '20% commission', 'flexible', 'open', 'email', true, 42);

-- ============================================================
-- OPERATOR LISTINGS (5 listings)
-- ============================================================
INSERT INTO public.operator_listings (id, operator_id, title, description, machine_types, service_radius_miles, cities_served, states_served, accepts_commission, min_daily_traffic, machine_count_available, status, featured, views) VALUES
  ('lst-11111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Available: Snack + Beverage Combo Machines - Phoenix Metro', 'We have 5 combo machines ready for placement. Full service including stocking, maintenance, and repairs. Cashless payment enabled. Perfect for offices and gyms.', '{snack,beverage,combo}', 50, '{Phoenix,Scottsdale,Tempe,Mesa,Chandler}', '{AZ}', true, 100, 5, 'available', true, 89),

  ('lst-22222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Full Vending Service - All of Texas', 'Largest independent operator in Texas. We handle everything from installation to daily restocking. Snack, beverage, and combo machines. Volume discounts available.', '{snack,beverage,combo,healthy}', 200, '{Dallas,Houston,Austin,San Antonio,Fort Worth}', '{TX}', true, 50, 20, 'available', true, 156),

  ('lst-33333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'Healthy & Fresh Vending - Colorado', 'Organic snacks, fresh salads, cold-pressed juices, and more. Our machines are modern, eco-friendly, and always stocked with the freshest options.', '{healthy,fresh_food,beverage}', 75, '{Denver,Boulder,Colorado Springs,Fort Collins}', '{CO}', true, 200, 8, 'available', false, 203),

  ('lst-44444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'Premium Coffee Machines - Northeast US', 'Bean-to-cup coffee machines that brew espresso, cappuccino, latte, and more. Fresh milk option available. Perfect for offices, hotels, and hospitals.', '{coffee}', 100, '{New York,Boston,Philadelphia,Newark}', '{NY,MA,PA,NJ,CT}', true, 100, 3, 'limited', false, 78),

  ('lst-55555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555', 'Any Machine, Any Location - Southeast', 'Whatever you need, we can provide. From basic snack machines to cutting-edge smart vending. Covering GA, FL, SC, NC, TN, and AL.', '{snack,beverage,combo,frozen,personal_care,electronics,custom}', 150, '{Atlanta,Miami,Charlotte,Nashville,Jacksonville}', '{GA,FL,SC,NC,TN,AL}', true, 0, 35, 'available', true, 134);

-- ============================================================
-- MATCHES (3 matches)
-- ============================================================
INSERT INTO public.matches (id, request_id, operator_id, matched_by, status, notes) VALUES
  ('mtch-1111-1111-1111-1111-111111111111', 'req-11111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'operator_applied', 'accepted', 'We can have machines installed within 2 weeks. Happy to do a site visit first.'),
  ('mtch-2222-2222-2222-2222-222222222222', 'req-77777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', 'operator_applied', 'installed', 'PPE machine installed on 2024-01-15. Fully operational.'),
  ('mtch-3333-3333-3333-3333-333333333333', 'req-33333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'operator_applied', 'pending', 'Very interested in the dorm placement. We have experience with university locations.');

-- ============================================================
-- REVIEWS (5 reviews)
-- ============================================================
INSERT INTO public.reviews (reviewer_id, reviewee_id, match_id, rating, comment) VALUES
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'mtch-1111-1111-1111-1111-111111111111', 5, 'Sarah and her team were fantastic. Machines were installed on time and always kept stocked. Highly recommend VendPro!'),
  ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', 'mtch-2222-2222-2222-2222-222222222222', 4, 'Good service overall. The PPE machine has been reliable. Would have liked faster initial response time.'),
  ('88888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333', NULL, 5, 'Emily from GreenVend is amazing to work with. The healthy options are a huge hit with our students.'),
  ('99999999-9999-9999-9999-999999999999', '44444444-4444-4444-4444-444444444444', NULL, 4, 'The coffee machine is great quality. Students love it. Only wish the refill schedule was more frequent.'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', NULL, 5, 'VendAll placed a combo machine in our building within a week of contacting them. Super easy process.');

-- ============================================================
-- SAVED REQUESTS (a few saves)
-- ============================================================
INSERT INTO public.saved_requests (operator_id, request_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'req-99999-9999-9999-9999-999999999999'),
  ('22222222-2222-2222-2222-222222222222', 'req-22222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333', 'req-88888-8888-8888-8888-888888888888'),
  ('55555555-5555-5555-5555-555555555555', 'req-55555-5555-5555-5555-555555555555'),
  ('55555555-5555-5555-5555-555555555555', 'req-aaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');


-- ============================================================
-- Step 14: SEED DATA - 123 Imported Leads
-- ============================================================

-- ==========================================================================
-- Vending Connector: Import 123 Leads
-- Attributed to ByteBite Vending (Apex) admin account
-- Run this in Supabase SQL Editor AFTER schema.sql and seed.sql
-- ==========================================================================

-- Step 1: Create ByteBite Vending admin profile (skip if exists)
INSERT INTO public.profiles (id, full_name, email, role, company_name, bio, city, state, verified)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'ByteBite Vending',
  'admin@bytebitevending.com',
  'location_manager',
  'ByteBite Vending (Apex)',
  'Platform admin account for imported vending leads.',
  'National',
  'US',
  true
) ON CONFLICT (id) DO NOTHING;

-- Step 2: Insert 123 leads into vending_requests
INSERT INTO public.vending_requests (
  created_by, title, description, location_name,
  city, state, zip, location_type,
  machine_types_wanted, urgency, status,
  contact_preference, is_public, views
) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Combo Machine needed in Montgomery, AL', 'Imported lead #1. Original seller: Kristie S. Listed at $420.', 'Combo Machine needed in Montgomery, AL',
   'Montgomery', 'AL', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'GYM', 'Imported lead #2. Original seller: Connor D. Listed at $440.', 'GYM',
   'Unknown', 'US', NULL, 'gym',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Apartment complex', 'Imported lead #3. Original seller: Alex F. Listed at $600.', 'Apartment complex',
   'Unknown', 'US', NULL, 'apartment',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Laundromat in Plainville CT needs ATM 06062', 'Imported lead #4. Original seller: Lance T. Listed at $500.', 'Laundromat in Plainville CT needs ATM 06062',
   'Plainville', 'CT', NULL, 'retail',
   '{custom}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'New Retail Store & Gamespace Needs Ice Cream Vending Machine', 'Imported lead #5. Original seller: Jose D. Listed at $420.', 'New Retail Store & Gamespace Needs Ice Cream Vending Machine',
   'Unknown', 'US', NULL, 'retail',
   '{frozen}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Barber shop 70714 needs vending services', 'Imported lead #6. Original seller: Lance T. Listed at $460.', 'Barber shop 70714 needs vending services',
   'Baker', 'LA', '70714', 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11205 Auto repair shop - Tired of sending customers to bank', 'Imported lead #7. Original seller: Lance T. Listed at $500.', '11205 Auto repair shop - Tired of sending customers to bank',
   'Brooklyn', 'NY', '11205', 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'HIGH-TRAFFIC RETAIL - 2 ARCADE MACHINE PLACEMENT', 'Imported lead #8. Original seller: Martin Vending Strategy. Listed at $550.', 'HIGH-TRAFFIC RETAIL - 2 ARCADE MACHINE PLACEMENT',
   'Unknown', 'US', NULL, 'retail',
   '{custom}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BRANDED BARBER SHOP - SNACK MACHINE OPPORTUNITY', 'Imported lead #9. Original seller: Martin Vending Strategy. Listed at $500.', 'BRANDED BARBER SHOP - SNACK MACHINE OPPORTUNITY',
   'Unknown', 'US', NULL, 'apartment',
   '{snack}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Seattle Washington needs vending', 'Imported lead #10. Original seller: Randolph B. Listed at $850.', 'Location in Seattle Washington needs vending',
   'Seattle', 'WA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location needs vending machine combo', 'Imported lead #11. Original seller: Oscar F. Listed at $760.', 'Location needs vending machine combo',
   'Unknown', 'US', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Company near 26062 needs to replace current vendor', 'Imported lead #12. Original seller: Damione B. Listed at $900.', 'Company near 26062 needs to replace current vendor',
   'Weirton', 'WV', '26062', 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Office building wants a combo vending machine - Great foottraffic', 'Imported lead #13. Original seller: Oscar F. Listed at $770.', 'Office building wants a combo vending machine - Great foottraffic',
   'Unknown', 'US', NULL, 'office',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Vending location for sale in 80031', 'Imported lead #14. Original seller: Joe T. Listed at $700.', 'Vending location for sale in 80031',
   'Westminster', 'CO', '80031', 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Richmond Virginia needs vending', 'Imported lead #15. Original seller: Casey C. Listed at $1,500.', 'Location in Richmond Virginia needs vending',
   'Richmond', 'VA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Busy good foot traffic barbershop', 'Imported lead #16. Original seller: Oscar F. Listed at $460.', 'Busy good foot traffic barbershop',
   'Unknown', 'US', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2-star hotel in 65616 needs vending services', 'Imported lead #17. Original seller: Lance T. Listed at $780.', '2-star hotel in 65616 needs vending services',
   'Branson', 'MO', '65616', 'hotel',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in North Little Rock, Arkansas needs vending', 'Imported lead #18. Original seller: Joshua. Listed at $1,000.', 'Location in North Little Rock, Arkansas needs vending',
   'North Little Rock', 'AR', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Hotel 90063 Seeking ATM Services', 'Imported lead #19. Original seller: Lance T. Listed at $780.', 'Hotel 90063 Seeking ATM Services',
   'Los Angeles', 'CA', '90063', 'hotel',
   '{custom}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Co working spaces office building looking for combination', 'Imported lead #20. Original seller: Oscar F. Listed at $950.', 'Co working spaces office building looking for combination',
   'Unknown', 'US', NULL, 'office',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Excellent location coworking spaces looking for a combo', 'Imported lead #21. Original seller: Oscar F. Listed at $640.', 'Excellent location coworking spaces looking for a combo',
   'Unknown', 'US', NULL, 'office',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Chico, California needs vending', 'Imported lead #22. Original seller: Aracely C. Listed at $780.', 'Location in Chico, California needs vending',
   'Chico', 'CA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Hinesville, Georgia needs vending', 'Imported lead #23. Original seller: Taylor W. Listed at $640.', 'Location in Hinesville, Georgia needs vending',
   'Hinesville', 'GA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in El Paso, Texas needs vending', 'Imported lead #24. Original seller: Jordan H. Listed at $650.', 'Location in El Paso, Texas needs vending',
   'El Paso', 'TX', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Monterey Park, California needs vending', 'Imported lead #25. Original seller: Aracely C. Listed at $780.', 'Location in Monterey Park, California needs vending',
   'Monterey Park', 'CA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Chantilly, Virginia needs vending', 'Imported lead #26. Original seller: Casey C. Listed at $1,450.', 'Location in Chantilly, Virginia needs vending',
   'Chantilly', 'VA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ATM Most famous tattoo artist in America', 'Imported lead #27. Original seller: Brad Schweizman. Listed at $640.', 'ATM Most famous tattoo artist in America',
   'Unknown', 'US', NULL, 'retail',
   '{custom}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '100+ Unit Apartment complex in Athens GA', 'Imported lead #28. Original seller: Jeremy Krys. Listed at $1,100.', '100+ Unit Apartment complex in Athens GA',
   'Athens', 'GA', NULL, 'apartment',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Convenience store needs ATM', 'Imported lead #29. Original seller: Michael L. Listed at $750.', 'Convenience store needs ATM',
   'Unknown', 'US', NULL, 'retail',
   '{custom}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Nail salon in Hyattsville MD', 'Imported lead #30. Original seller: Jeremy Krys. Listed at $700.', 'Nail salon in Hyattsville MD',
   'Hyattsville', 'MD', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Barber shop in Atlanta Georgia', 'Imported lead #31. Original seller: Jeremy Krys. Listed at $780.', 'Barber shop in Atlanta Georgia',
   'Atlanta', 'GA', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Columbus, Ohio needs vending', 'Imported lead #32. Original seller: Ashley Y. Listed at $850.', 'Location in Columbus, Ohio needs vending',
   'Columbus', 'OH', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Laundromat in Hayward CA', 'Imported lead #33. Original seller: Shelly W. Listed at $600.', 'Laundromat in Hayward CA',
   'Hayward', 'CA', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Long Beach, California needs vending', 'Imported lead #34. Original seller: Aracely C. Listed at $1,100.', 'Location in Long Beach, California needs vending',
   'Long Beach', 'CA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Martial Arts School 24/7', 'Imported lead #35. Original seller: Mia. Listed at $760.', 'Martial Arts School 24/7',
   'Unknown', 'US', NULL, 'school',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Apartment Complex Looking for Vending Machine', 'Imported lead #36. Original seller: Mia. Listed at $600.', 'Apartment Complex Looking for Vending Machine',
   'Unknown', 'US', NULL, 'apartment',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'High Traffic Barber Shop Needs Vending Machine', 'Imported lead #37. Original seller: Mia. Listed at $800.', 'High Traffic Barber Shop Needs Vending Machine',
   'Unknown', 'US', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Busy laundromat In Raleigh', 'Imported lead #38. Original seller: Jeremy Krys. Listed at $800.', 'Busy laundromat In Raleigh',
   'Unknown', 'US', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Indianapolis, Indiana needs vending', 'Imported lead #39. Original seller: Ashley Y. Listed at $800.', 'Location in Indianapolis, Indiana needs vending',
   'Indianapolis', 'IN', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Charlotte, North Carolina needs vending', 'Imported lead #40. Original seller: Ashley Y. Listed at $750.', 'Location in Charlotte, North Carolina needs vending',
   'Charlotte', 'NC', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Akron, Ohio needs vending', 'Imported lead #41. Original seller: Ashley Y. Listed at $800.', 'Location in Akron, Ohio needs vending',
   'Akron', 'OH', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Memphis, Tennessee needs vending', 'Imported lead #42. Original seller: Ashley Y. Listed at $800.', 'Location in Memphis, Tennessee needs vending',
   'Memphis', 'TN', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Louisville, Kentucky needs vending', 'Imported lead #43. Original seller: Ashley Y. Listed at $850.', 'Location in Louisville, Kentucky needs vending',
   'Louisville', 'KY', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Kansas City, Missouri needs vending', 'Imported lead #44. Original seller: Ashley Y. Listed at $850.', 'Location in Kansas City, Missouri needs vending',
   'Kansas City', 'MO', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Omaha, Nebraska needs vending', 'Imported lead #45. Original seller: Ashley Y. Listed at $800.', 'Location in Omaha, Nebraska needs vending',
   'Omaha', 'NE', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Tulsa, Oklahoma needs vending', 'Imported lead #46. Original seller: Ashley Y. Listed at $750.', 'Location in Tulsa, Oklahoma needs vending',
   'Tulsa', 'OK', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Virginia Beach, Virginia needs vending', 'Imported lead #47. Original seller: Ashley Y. Listed at $800.', 'Location in Virginia Beach, Virginia needs vending',
   'Virginia Beach', 'VA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Atlanta, Georgia needs vending', 'Imported lead #48. Original seller: Ashley Y. Listed at $850.', 'Location in Atlanta, Georgia needs vending',
   'Atlanta', 'GA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Colorado Springs, Colorado needs vending', 'Imported lead #49. Original seller: Ashley Y. Listed at $800.', 'Location in Colorado Springs, Colorado needs vending',
   'Colorado Springs', 'CO', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Raleigh, North Carolina needs vending', 'Imported lead #50. Original seller: Ashley Y. Listed at $800.', 'Location in Raleigh, North Carolina needs vending',
   'Raleigh', 'NC', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Minneapolis, Minnesota needs vending', 'Imported lead #51. Original seller: Ashley Y. Listed at $850.', 'Location in Minneapolis, Minnesota needs vending',
   'Minneapolis', 'MN', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in New Orleans, Louisiana needs vending', 'Imported lead #52. Original seller: Ashley Y. Listed at $780.', 'Location in New Orleans, Louisiana needs vending',
   'New Orleans', 'LA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Tampa, Florida needs vending', 'Imported lead #53. Original seller: Ashley Y. Listed at $800.', 'Location in Tampa, Florida needs vending',
   'Tampa', 'FL', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Pittsburgh, Pennsylvania needs vending', 'Imported lead #54. Original seller: Ashley Y. Listed at $820.', 'Location in Pittsburgh, Pennsylvania needs vending',
   'Pittsburgh', 'PA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Warehouse In Chantilly Virginia 20151', 'Imported lead #55. Original seller: Patricia H. Listed at $640.', 'Warehouse In Chantilly Virginia 20151',
   'Chantilly', 'VA', NULL, 'warehouse',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'This location has lots of foot traffic', 'Imported lead #56. Original seller: Oscar F. Listed at $460.', 'This location has lots of foot traffic',
   'Unknown', 'US', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Home, Syracuse, IN, 46567', 'Imported lead #57. Original seller: Edwin G. Listed at $750.', 'Home, Syracuse, IN, 46567',
   'Syracuse', 'IN', '46567', 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Co-working office building', 'Imported lead #58. Original seller: Oscar F. Listed at $760.', 'Co-working office building',
   'Unknown', 'US', NULL, 'office',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Small auto shop needs vending service 48120', 'Imported lead #59. Original seller: Lance T. Listed at $380.', 'Small auto shop needs vending service 48120',
   'Dearborn', 'MI', '48120', 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Excellent co-working space', 'Imported lead #60. Original seller: Oscar F. Listed at $820.', 'Excellent co-working space',
   'Unknown', 'US', NULL, 'office',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Fayetteville, NC needs vending', 'Imported lead #61. Original seller: Ashley Y. Listed at $780.', 'Location in Fayetteville, NC needs vending',
   'Fayetteville', 'NC', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Shreveport, LA needs vending', 'Imported lead #62. Original seller: Ashley Y. Listed at $720.', 'Location in Shreveport, LA needs vending',
   'Shreveport', 'LA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Baton Rouge, LA needs vending', 'Imported lead #63. Original seller: Ashley Y. Listed at $750.', 'Location in Baton Rouge, LA needs vending',
   'Baton Rouge', 'LA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Lexington, KY needs vending', 'Imported lead #64. Original seller: Ashley Y. Listed at $780.', 'Location in Lexington, KY needs vending',
   'Lexington', 'KY', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Anchorage, AK needs vending', 'Imported lead #65. Original seller: Ashley Y. Listed at $850.', 'Location in Anchorage, AK needs vending',
   'Anchorage', 'AK', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in St. Petersburg, FL needs vending', 'Imported lead #66. Original seller: Ashley Y. Listed at $800.', 'Location in St. Petersburg, FL needs vending',
   'St. Petersburg', 'FL', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Newark, NJ needs vending', 'Imported lead #67. Original seller: Ashley Y. Listed at $850.', 'Location in Newark, NJ needs vending',
   'Newark', 'NJ', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Plano, TX needs vending', 'Imported lead #68. Original seller: Ashley Y. Listed at $780.', 'Location in Plano, TX needs vending',
   'Plano', 'TX', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Henderson, NV needs vending', 'Imported lead #69. Original seller: Ashley Y. Listed at $750.', 'Location in Henderson, NV needs vending',
   'Henderson', 'NV', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Greensboro, NC needs vending', 'Imported lead #70. Original seller: Ashley Y. Listed at $750.', 'Location in Greensboro, NC needs vending',
   'Greensboro', 'NC', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Stockton, CA needs vending', 'Imported lead #71. Original seller: Aracely C. Listed at $780.', 'Location in Stockton, CA needs vending',
   'Stockton', 'CA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Lincoln, NE needs vending', 'Imported lead #72. Original seller: Ashley Y. Listed at $720.', 'Location in Lincoln, NE needs vending',
   'Lincoln', 'NE', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in St. Louis, MO needs vending', 'Imported lead #73. Original seller: Ashley Y. Listed at $800.', 'Location in St. Louis, MO needs vending',
   'St. Louis', 'MO', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Madison, WI needs vending', 'Imported lead #74. Original seller: Ashley Y. Listed at $780.', 'Location in Madison, WI needs vending',
   'Madison', 'WI', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Durham, NC needs vending', 'Imported lead #75. Original seller: Ashley Y. Listed at $750.', 'Location in Durham, NC needs vending',
   'Durham', 'NC', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Office space in Columbia SC', 'Imported lead #76. Original seller: Edwin G. Listed at $700.', 'Office space in Columbia SC',
   'Columbia', 'SC', NULL, 'office',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Aurora, CO needs vending', 'Imported lead #77. Original seller: Ashley Y. Listed at $780.', 'Location in Aurora, CO needs vending',
   'Aurora', 'CO', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Riverside, CA needs vending', 'Imported lead #78. Original seller: Aracely C. Listed at $800.', 'Location in Riverside, CA needs vending',
   'Riverside', 'CA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Bakersfield, CA needs vending', 'Imported lead #79. Original seller: Aracely C. Listed at $750.', 'Location in Bakersfield, CA needs vending',
   'Bakersfield', 'CA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Fort Wayne, IN needs vending', 'Imported lead #80. Original seller: Ashley Y. Listed at $740.', 'Location in Fort Wayne, IN needs vending',
   'Fort Wayne', 'IN', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Busy barbershop in Shreveport LA', 'Imported lead #81. Original seller: Lance T. Listed at $580.', 'Busy barbershop in Shreveport LA',
   'Shreveport', 'LA', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Spokane, WA needs vending', 'Imported lead #82. Original seller: Ashley Y. Listed at $760.', 'Location in Spokane, WA needs vending',
   'Spokane', 'WA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Chandler, AZ needs vending', 'Imported lead #83. Original seller: Ashley Y. Listed at $750.', 'Location in Chandler, AZ needs vending',
   'Chandler', 'AZ', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Scottsdale, AZ needs vending', 'Imported lead #84. Original seller: Ashley Y. Listed at $800.', 'Location in Scottsdale, AZ needs vending',
   'Scottsdale', 'AZ', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Glendale, AZ needs vending', 'Imported lead #85. Original seller: Ashley Y. Listed at $750.', 'Location in Glendale, AZ needs vending',
   'Glendale', 'AZ', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Tacoma, WA needs vending', 'Imported lead #86. Original seller: Ashley Y. Listed at $760.', 'Location in Tacoma, WA needs vending',
   'Tacoma', 'WA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Garland, TX needs vending', 'Imported lead #87. Original seller: Ashley Y. Listed at $750.', 'Location in Garland, TX needs vending',
   'Garland', 'TX', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Irving, TX needs vending', 'Imported lead #88. Original seller: Ashley Y. Listed at $780.', 'Location in Irving, TX needs vending',
   'Irving', 'TX', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Fremont, CA needs vending', 'Imported lead #89. Original seller: Aracely C. Listed at $800.', 'Location in Fremont, CA needs vending',
   'Fremont', 'CA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in San Bernardino, CA needs vending', 'Imported lead #90. Original seller: Aracely C. Listed at $750.', 'Location in San Bernardino, CA needs vending',
   'San Bernardino', 'CA', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Boise, ID needs vending', 'Imported lead #91. Original seller: Ashley Y. Listed at $740.', 'Location in Boise, ID needs vending',
   'Boise', 'ID', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Birmingham, AL needs vending', 'Imported lead #92. Original seller: Ashley Y. Listed at $750.', 'Location in Birmingham, AL needs vending',
   'Birmingham', 'AL', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Office park in Bethesda MD', 'Imported lead #93. Original seller: Jeremy Krys. Listed at $660.', 'Office park in Bethesda MD',
   'Bethesda', 'MD', NULL, 'office',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Busy nail salon in Silver Spring MD', 'Imported lead #94. Original seller: Jeremy Krys. Listed at $680.', 'Busy nail salon in Silver Spring MD',
   'Silver Spring', 'MD', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Auto dealership in Orlando FL', 'Imported lead #95. Original seller: Mia. Listed at $900.', 'Auto dealership in Orlando FL',
   'Orlando', 'FL', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Stand Alone Bldg, Charleston, WV, 25304', 'Imported lead #96. Original seller: Edwin G. Listed at $1,600.', 'Stand Alone Bldg, Charleston, WV, 25304',
   'Charleston', 'WV', '25304', 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Super Busy Hotel in El Monte CA', 'Imported lead #97. Original seller: Jeremy Krys. Listed at $1,428.', 'Super Busy Hotel in El Monte CA',
   'El Monte', 'CA', NULL, 'hotel',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Nice Apartment Complex in MD', 'Imported lead #98. Original seller: Jeremy Krys. Listed at $640.', 'Nice Apartment Complex in MD',
   'Unknown', 'US', NULL, 'apartment',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Laundromat in Inglewood, California', 'Imported lead #99. Original seller: Shelly W. Listed at $550.', 'Laundromat in Inglewood, California',
   'Inglewood', 'CA', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Two busy gymnastic places', 'Imported lead #100. Original seller: Jeremy Krys. Listed at $900.', 'Two busy gymnastic places',
   'Unknown', 'US', NULL, 'gym',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Laundromat in Pawtucket RI', 'Imported lead #101. Original seller: Shelly W. Listed at $550.', 'Laundromat in Pawtucket RI',
   'Pawtucket', 'RI', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Gas station in Phoenix, AZ', 'Imported lead #102. Original seller: Jordan H. Listed at $800.', 'Gas station in Phoenix, AZ',
   'Phoenix', 'AZ', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Gym in Nashville TN', 'Imported lead #103. Original seller: Jeremy Krys. Listed at $820.', 'Gym in Nashville TN',
   'Nashville', 'TN', NULL, 'gym',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Car wash in Houston TX', 'Imported lead #104. Original seller: Jordan H. Listed at $750.', 'Car wash in Houston TX',
   'Houston', 'TX', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Barbershop in Detroit MI', 'Imported lead #105. Original seller: Lance T. Listed at $520.', 'Barbershop in Detroit MI',
   'Detroit', 'MI', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Office building in Denver CO', 'Imported lead #106. Original seller: Oscar F. Listed at $880.', 'Office building in Denver CO',
   'Denver', 'CO', NULL, 'office',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Manufacturing facility in Indiana', 'Imported lead #107. Original seller: Christopher S. Listed at $1,080.', 'Manufacturing facility in Indiana',
   'Unknown', 'IN', NULL, 'warehouse',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Hotel in San Antonio TX', 'Imported lead #108. Original seller: Mia. Listed at $950.', 'Hotel in San Antonio TX',
   'San Antonio', 'TX', NULL, 'hotel',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Laundromat in Providence RI', 'Imported lead #109. Original seller: Shelly W. Listed at $580.', 'Laundromat in Providence RI',
   'Providence', 'RI', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Barbershop in Baltimore MD', 'Imported lead #110. Original seller: Lance T. Listed at $560.', 'Barbershop in Baltimore MD',
   'Baltimore', 'MD', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Convenience store in Chicago IL', 'Imported lead #111. Original seller: Michael L. Listed at $820.', 'Convenience store in Chicago IL',
   'Chicago', 'IL', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Manufacturing Facility in Indiana (2)', 'Imported lead #112. Original seller: Christopher S. Listed at $1,080.', 'Manufacturing Facility in Indiana (2)',
   'Unknown', 'IN', NULL, 'warehouse',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Corpus Christi TX needs vending', 'Imported lead #113. Original seller: Jordan H. Listed at $720.', 'Location in Corpus Christi TX needs vending',
   'Corpus Christi', 'TX', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Lubbock TX needs vending', 'Imported lead #114. Original seller: Jordan H. Listed at $680.', 'Location in Lubbock TX needs vending',
   'Lubbock', 'TX', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Fort Worth TX needs vending', 'Imported lead #115. Original seller: Jordan H. Listed at $800.', 'Location in Fort Worth TX needs vending',
   'Fort Worth', 'TX', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Barbershop in St. Louis MO', 'Imported lead #116. Original seller: Lance T. Listed at $520.', 'Barbershop in St. Louis MO',
   'St. Louis', 'MO', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Office building in Tampa FL', 'Imported lead #117. Original seller: Mia. Listed at $950.', 'Office building in Tampa FL',
   'Tampa', 'FL', NULL, 'office',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Laundromat in Riverside CA', 'Imported lead #118. Original seller: Shelly W. Listed at $600.', 'Laundromat in Riverside CA',
   'Riverside', 'CA', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Albuquerque NM needs vending', 'Imported lead #119. Original seller: Ashley Y. Listed at $700.', 'Location in Albuquerque NM needs vending',
   'Albuquerque', 'NM', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location in Tucson AZ needs vending', 'Imported lead #120. Original seller: Ashley Y. Listed at $680.', 'Location in Tucson AZ needs vending',
   'Tucson', 'AZ', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Plaza Building', 'Imported lead #121. Original seller: Edwin G. Listed at $900.', 'Plaza Building',
   'Unknown', 'US', NULL, 'retail',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Stand Alone Building', 'Imported lead #122. Original seller: Edwin G. Listed at $375.', 'Stand Alone Building',
   'Unknown', 'US', NULL, 'other',
   '{combo}', 'flexible', 'open',
   'platform_message', true, 0),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Car/truck Wash Snack and/or Drink or Combo Machine', 'Imported lead #123. Original seller: Mia. Listed at $400.', 'Car/truck Wash Snack and/or Drink or Combo Machine',
   'Unknown', 'US', NULL, 'retail',
   '{snack,beverage,combo}', 'flexible', 'open',
   'platform_message', true, 0);

-- Verify: count imported leads
-- SELECT count(*) FROM public.vending_requests WHERE created_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
