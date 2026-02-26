-- VendHub Seed Data
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
