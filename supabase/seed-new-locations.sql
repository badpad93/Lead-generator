-- Generated SQL for 222 new location listings (inquiry only)
-- All listings are lead_type = 'contracted' (inquiry only, no buy button)
-- Run AFTER migration 059_lead_type.sql and seed-locations.sql

DO $$
DECLARE admin_id uuid;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email = 'james@apexaivending.com' LIMIT 1;
  IF admin_id IS NULL THEN
    SELECT id INTO admin_id FROM profiles LIMIT 1;
  END IF;

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Busy Smoke/Vape Shop in Hephzibah 30815 needs ATM', '50+ customers daily, owner says probably even more. In busy shopping strip.', 'shop', 'Hephzibah', 'GA', NULL, 'retail', '{custom}', 420, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-02T21:40:03.985Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Auto Shop in Chaska 55318 needs vending', 'Auto shop in Chaska, open to any vending options, varied amount of customers 25-100 daily.', 'auto', 'Chaska', 'MN', NULL, 'other', '{snack}', 400, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T20:14:33.232Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'New Restaurant in Mpls 55407 needs ATM', 'Brand new restaurant opens in very popular neighborhood, so far 20-30/day visitors', 'restaurant', 'Minneapolis', 'MN', NULL, 'retail', '{custom}', 360, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T14:52:51.447Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Gym in Virginia Beach, Virginia 23454 needs vending', 'Gym in Virginia Beach, Virginia is looking for a vending operator.', 'gym', 'Virginia Beach', 'VA', NULL, 'gym', '{snack}', 500, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T12:34:09.310Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Houston, Texas needs vending', 'Location in Houston, Texas is looking for a vending operator.', 'auto', 'Houston', 'TX', NULL, 'other', '{snack}', 630, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T14:59:33.876Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'High Traffic Restaurant Needs ATM', 'Popular restaurant needs an ATM, Average 200+ foot traffic per day!', 'restaurant', 'Newark', 'NJ', NULL, 'retail', '{custom}', 500, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T21:52:56.223Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'BOXING GYM', 'Boxing Gym Needs a Smart Cooler', 'gym', 'Plymouth', 'MI', NULL, 'gym', '{snack}', 910, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T20:58:09.849Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Commercial Warehouse 24/7 Combo', 'Commercial Warehouse open 24/7 Combo Machine', 'warehouse', 'Brampton', 'ON', NULL, 'warehouse', '{snack}', 600, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T16:46:02.249Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Cash Only Smoke Shop - Signed Agreement', 'Smoke shop ready for ATM install, 50-60 foot traffic per day', 'shop', 'Chicago', 'IL', NULL, 'retail', '{custom}', 420, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T15:29:54.345Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'INSTALL THIS WEEK - AUTO SHOP LOCATION', 'Auto shop location, negotiation done, install immediately', 'auto', 'Burbank', 'CA', NULL, 'other', '{snack}', 400, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T01:35:39.567Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Combo Machine', 'Gym interested in combo machine', 'gym', 'Chesapeake', 'VA', NULL, 'gym', '{snack}', 610, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T17:18:01.699Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'AUTO BODY SHOP NEED VENDING MACHINE', 'Popular Auto Body Shop, 50-60+ customers per day', 'auto', 'Chicago', 'IL', NULL, 'other', '{snack}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T16:12:22.716Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Atlantic City, New Jersey needs vending', 'Location in Atlantic City, New Jersey is looking for a vending operator.', 'shop', 'Atlantic City', 'NJ', NULL, 'retail', '{snack}', 600, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T13:07:31.777Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Auto Repair Needs Vending Machine', 'Auto repair shop with steady traffic of 40-50 a day', 'auto', 'Lake Worth Beach', 'FL', NULL, 'other', '{custom}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T21:02:16.888Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Church in Hephzibah 30815 needs vending in busy lobby', '250-300 attendees every Sunday - needs vending in busy lobby', 'church', 'Hephzibah', 'GA', NULL, 'other', '{snack}', 650, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T20:00:57.222Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Cleveland, Ohio needs Coffee Machine', 'Location in Cleveland, Ohio is looking for a coffee vending operator.', 'office', 'Cleveland', 'OH', NULL, 'office', '{coffee}', 570, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T18:22:42.203Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Cleveland, Ohio needs Combo Vending Machine', 'Location in Cleveland, Ohio is looking for a combo vending operator.', 'office', 'Cleveland', 'OH', NULL, 'office', '{snack}', 570, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T18:01:42.291Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '440+ UNITS APARTMENT COMPLEX NEED VENDING MACHINE', '440+ units apartment complex needs vending machine', 'apartment', 'Orlando', 'FL', NULL, 'apartment', '{snack}', 1000, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T16:05:58.981Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Food Mart, Waterloo Iowa', 'Merchant needs an ATM and is interested in lottery games', 'shop', 'Waterloo', 'IA', NULL, 'retail', '{custom}', 470, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T03:00:16.718Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Plaza, Nashville, TN, 37203', '10 Employees and 50+ minimum Traffic, 7 days a week', 'gym', 'Nashville', 'TN', NULL, 'gym', '{snack}', 600, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T18:36:23.083Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Jonesboro, AR 72401 needs Vending', 'Location in Jonesboro, AR is looking for a vending operator.', 'warehouse', 'Jonesboro', 'AR', NULL, 'warehouse', '{snack}', 800, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T16:04:44.199Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Richmond, VA 23224 needs vending', 'Location in Richmond, VA is looking for a vending operator.', 'manufacturing', 'Richmond', 'VA', NULL, 'warehouse', '{snack}', 900, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T14:00:39.621Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Office/warehouse', '45-50 employees, currently no machine on site', 'warehouse', 'Cincinnati', 'OH', NULL, 'warehouse', '{snack}', 800, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T05:59:26.117Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Dry Cleaner Need ATM', 'Dry cleaner in busy downtown Detroit area, 40-50+ in-store', 'laundromat', 'Detroit', 'MI', NULL, 'other', '{custom}', 310, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T20:50:37.936Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'PHARMACY NEEDS A COFFEE MACHINE', 'Pharmacy inside a medical center with steady traffic', 'shop', 'Washington', 'DC', NULL, 'retail', '{coffee}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T23:27:47.982Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'EVENT VENUE NEEDS ATM', 'Event venue for weddings, corporate events, birthdays', 'church', 'Brooklyn', 'NY', NULL, 'other', '{custom}', 350, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T22:41:44.892Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'BUSY LAUNDROMAT NEEDS A COFFEE MACHINE', 'Busy laundromat, weekend well over 200+ people', 'laundromat', 'St. Louis', 'MO', NULL, 'other', '{coffee}', 350, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T21:45:35.016Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'KID FRIENDLY LAUNDROMAT NEEDS A CLAW MACHINE', 'Busy laundromat needs a claw machine, lots of kids and traffic', 'laundromat', 'St. Louis', 'MO', NULL, 'other', '{custom}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T20:30:56.663Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Stand Alone, San Antonio, TX, 78217', '6 Employees and daily foot traffic of 50 minimum', 'gym', 'San Antonio', 'TX', NULL, 'gym', '{snack}', 650, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T18:46:54.081Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in San Angelo, Texas needs vending', 'Location in San Angelo, Texas is looking for a vending operator.', 'office', 'San Angelo', 'TX', NULL, 'office', '{snack}', 900, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T15:21:04.452Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Busy Barber shop, Logan Utah wants Smart Cooler', 'Highly rated busy barbershop seeking a smart cooler', 'barbershop', 'Logan', 'UT', NULL, 'retail', '{snack}', 470, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-18T21:15:45.392Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Busy Laundromat Needs ATM', 'Busy Laundromat needs an ATM, 100% interested', 'laundromat', 'Lakeside', 'CA', NULL, 'other', '{custom}', 350, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-17T22:32:48.518Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Sacramento, CA 95828 needs ATM', '8 chair barbershop looking for ATM operator', 'barbershop', 'Sacramento', 'CA', NULL, 'retail', '{custom}', 400, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-17T18:25:41.674Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Ocala, Florida needs vending', 'Location in Ocala, Florida is looking for a combo vending machine operator.', 'barbershop', 'Ocala', 'FL', NULL, 'retail', '{snack}', 400, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-17T16:53:56.137Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Doral, Florida needs vending', 'Location in Doral, Florida is looking for a coffee vending operator.', 'barbershop', 'Doral', 'FL', NULL, 'retail', '{coffee}', 360, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-17T13:09:46.271Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Grocery store NEED Claw Machine', 'Grocery store needs a claw machine', 'restaurant', 'Denver', 'CO', NULL, 'retail', '{custom}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-16T20:58:32.517Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Ludington MI Lead', 'Snack Machine needed for a Ludington Park', 'community', 'Ludington', 'MI', NULL, 'other', '{snack}', 810, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-16T19:06:56.740Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Tattoo shop with high flow, Twin city', 'Tattoo shop that needs an ATM and a vending machine', 'barbershop', 'Twin Falls', 'ID', NULL, 'retail', '{custom}', 420, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-16T18:53:03.922Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in San Diego, CA 92154', 'Location in San Diego, CA is looking for a vending operator.', 'transportation', 'San Diego', 'CA', NULL, 'other', '{snack}', 540, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-16T15:39:42.308Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Fitness center combo machine', 'Fitness center looking for combo machine', 'gym', 'Clarksville', 'TN', NULL, 'gym', '{snack}', 390, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-16T15:11:17.012Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Smart Cooler Needed For Tattoo Shop', 'Tattoo shop looking for a smart cooler', 'shop', 'Fort Lauderdale', 'FL', NULL, 'retail', '{snack}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-15T18:30:39.538Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Caribbean Authentic Restaurant in GTA', 'Restaurant foot traffic approximately 0-75', 'restaurant', 'Mississauga', 'ON', NULL, 'retail', '{custom}', 420, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-14T20:34:50.156Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Hotel Seeks Vending Service', 'Name brand hotel with 40 rooms and steady occupancy', 'hotel', 'Stockton', 'IL', NULL, 'hotel', '{snack}', 650, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-14T04:24:36.217Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'USED AUTO DEALER/SERVICE CENTER', 'Used Auto Dealer with 8 employees', 'shop', 'Knoxville', 'TN', NULL, 'retail', '{snack}', 360, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-13T20:50:02.570Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MEET & GREET ASAP', 'Fitness center wants touch coffee bar, 150+ day traffic', 'gym', 'Laguna Niguel', 'CA', NULL, 'gym', '{coffee}', 680, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-13T20:23:45.975Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Industrial Machine Rental & Service Center', 'Industrial Machine Rental requesting smart cooler or combo machine', 'auto', 'Cleveland', 'TX', NULL, 'other', '{snack}', 400, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-13T15:23:39.259Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Laundromat Claw Machine Location', 'Established laundromat, 500+ customers per week', 'laundromat', 'Elizabethtown', 'KY', NULL, 'other', '{custom}', 260, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-11T17:55:19.370Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'High-Traffic Laundromat Snack Machine Location', 'Established laundromat, 500+ customers weekly', 'laundromat', 'Elizabethtown', 'KY', NULL, 'other', '{snack}', 260, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-11T15:56:36.321Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Montrose, Colorado needs vending', 'Location in Montrose, Colorado is looking for a vending operator.', 'hotel', 'Montrose', 'CO', NULL, 'hotel', '{snack}', 1100, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-11T14:32:56.747Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Gym Needs Drink Only Vending Machine', 'Gym needs drink only vending machine, 30+ daily foot traffic', 'gym', 'Wheatland', 'CA', NULL, 'gym', '{snack}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-10T22:11:50.576Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Crystal 55429 needs Vending', '100-150 visitors per day, wants healthy options', 'community', 'Crystal', 'MN', NULL, 'other', '{snack}', 710, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-10T20:12:18.962Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Auburn, Alabama needs vending', 'Location in Auburn, Alabama is looking for a vending operator.', 'auto', 'Auburn', 'AL', NULL, 'other', '{snack}', 320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-10T16:18:47.255Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Retail Store Needs Combo Machine in Cornelia', 'Guatemalan store requesting combo machine, 65-100+ foot traffic', 'shop', 'Cornelia', 'GA', NULL, 'retail', '{snack}', 270, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-08T19:00:36.275Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Motel/Hotel', 'Looking to start vending services, requesting drink and snack machine', 'hotel', 'Hebron', 'OH', NULL, 'hotel', '{snack}', 540, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-08T18:54:33.580Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'GYM NEEDS A DRINK ONLY VENDING MACHINE', 'Drink-only vending machine at a gym, health-based drinks', 'gym', 'Chicago', 'IL', NULL, 'gym', '{snack}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-07T20:50:17.868Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Townhome Complex in Republic 65738', 'New Townhome Complex, 135 Townhomes, 70 people a day', 'apartment', 'Republic', 'MO', NULL, 'apartment', '{snack}', 790, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-07T20:18:28.891Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'New apartments in Augusta 30909 needs ATM', 'New apartment complex, 150 apartments filling up', 'apartment', 'Augusta', 'GA', NULL, 'apartment', '{custom}', 600, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-06T19:28:00.516Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in West View, Pennsylvania needs vending', 'Location in West View, Pennsylvania is looking for a vending operator.', 'barbershop', 'West View', 'PA', NULL, 'retail', '{custom}', 320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-03T16:33:51.234Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Fresno, California needs vending', 'Location in Fresno, California is looking for a vending operator.', 'auto', 'Fresno', 'CA', NULL, 'other', '{snack}', 270, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-02T00:28:07.080Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Montgomery, Alabama needs Claw Machine', 'Location in Montgomery, Alabama, claw operator for adult gaming', 'laundromat', 'Montgomery', 'AL', NULL, 'other', '{custom}', 440, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-31T18:28:35.452Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Premier Laundromat - 2 MACHINES', 'Laundromat vending, 50+ foot traffic daily', 'laundromat', 'North York', 'ON', NULL, 'other', '{snack}', 420, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-28T19:13:57.339Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Office in Cowessess', 'Estimated 45 employees', 'government', 'Kenosee Lake', 'SK', NULL, 'government', '{snack}', 600, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-28T13:10:49.841Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Office in Valleyview', 'Estimated 45-75 daily foot traffic', 'hospital', 'Valleyview', 'AB', NULL, 'hospital', '{snack}', 700, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-28T13:08:36.464Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in San Marcos, Texas needs Claw Machine', 'Location in San Marcos, Texas is looking for a Claw vending operator.', 'restaurant', 'San Marcos', 'TX', NULL, 'retail', '{custom}', 350, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-25T18:16:33.494Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Gym in Church Hill, Tennessee needs vending', 'Gym needs vending services, about 50 visitors per day', 'gym', 'Church Hill', 'TN', NULL, 'gym', '{snack}', 550, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-25T17:08:13.266Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Large Gym in Lake City Florida needs vending', 'Large gym, over 300 daily visitors, no competition nearby', 'gym', 'Lake City', 'FL', NULL, 'gym', '{snack}', 740, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-24T20:10:14.273Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Baton Rouge, Louisiana needs vending', 'Location in Baton Rouge, Louisiana is looking for a vending operator.', 'community', 'Baton Rouge', 'LA', NULL, 'other', '{snack}', 800, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-23T20:57:25.371Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Santa Rosa, California needs ATM', '6 chair barbershop looking for ATM operator', 'barbershop', 'Santa Rosa', 'CA', NULL, 'retail', '{custom}', 400, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-23T19:57:29.699Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Looking for vending machine in missouri', 'Church looking for snacks and beverages', 'church', 'Grandview', 'MO', NULL, 'other', '{snack}', 450, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-23T19:36:04.129Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Popular Hotel Chain', 'Brand new Hotel with 124 units, popular chain', 'hotel', 'LaGrange', 'GA', NULL, 'hotel', '{snack}', 540, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-23T17:57:35.538Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Pet store', 'Pet store wants a smart cooler machine', 'shop', 'Los Angeles', 'CA', NULL, 'retail', '{snack}', 420, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-23T14:04:20.887Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Private Vehicle Registration Office Oakland', 'Busy Private Vehicle Registration Office, 50+ daily foot traffic', 'auto', 'Oakland', 'CA', NULL, 'other', '{snack}', 270, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-19T22:52:35.501Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Private Vehicle Registration Office San Leandro', 'Private Vehicle Registration Office, 30-40 daily foot traffic', 'auto', 'San Leandro', 'CA', NULL, 'other', '{snack}', 270, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-19T22:40:02.247Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'GYM 24/7 COMBO', 'Gym open 24/7, limited space in front entrance', 'gym', 'Key West', 'FL', NULL, 'gym', '{snack}', 750, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-19T20:38:19.819Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in West Palm Beach, Florida needs vending', 'Location in West Palm Beach, Florida is looking for a vending operator.', 'barbershop', 'West Palm Beach', 'FL', NULL, 'retail', '{coffee}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-18T18:46:38.007Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Auto body shop in Michigan', 'Busy auto shop that sees 50+ daily', 'auto', 'Mount Clemens', 'MI', NULL, 'other', '{snack}', 600, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-18T13:15:17.866Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Busy Brake shop in Michigan', 'Busy brake shop wanting a combo machine', 'auto', 'Sterling Heights', 'MI', NULL, 'other', '{snack}', 630, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-18T13:00:13.743Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Smoke shop needs an ATM', 'Smoke shop actively looking for an ATM', 'shop', 'Houston', 'TX', NULL, 'retail', '{custom}', 400, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-17T17:46:16.127Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Hotel in Garner, NC needs ATM', 'Location in Garner, North Carolina looking for an ATM operator.', 'hotel', 'Garner', 'NC', NULL, 'hotel', '{custom}', 680, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-17T15:27:34.811Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Hotel in Raleigh, NC needs ATM', 'Location in Raleigh, North Carolina looking for an ATM operator.', 'hotel', 'Raleigh', 'NC', NULL, 'hotel', '{custom}', 750, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-17T14:31:32.211Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Mena, Arkansas needs vending', 'Location in Mena, Arkansas is looking for a vending operator.', 'mining', 'Mena', 'AR', NULL, 'other', '{snack}', 550, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-16T21:35:53.009Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Company near 22903 looking for vending machines', 'Company with 75 employees, no vending machines on site', 'hospital', 'Charlottesville', 'VA', NULL, 'hospital', '{snack}', 800, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-16T18:39:26.993Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Company near 44087 needs Advanced Technology', 'Local company evaluating options to replace current vending', 'auto', 'Twinsburg', 'OH', NULL, 'other', '{snack}', 320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-16T18:04:46.379Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Panama City Beach, Florida needs vending', 'Location in Panama City Beach, Florida is looking for a vending operator.', 'hotel', 'Panama City Beach', 'FL', NULL, 'hotel', '{snack}', 530, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-16T15:21:59.297Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Arcade machine needed for Entertainment venue', 'Busy venue, 200+ daily on weekends, looking for arcade machines', 'shop', 'Burbank', 'CA', NULL, 'retail', '{custom}', 420, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-15T07:05:35.822Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Plaza, Mishawaka, IN, 46545', 'Gym with 300 to 400 daily traffic, 7 Employees', 'gym', 'Mishawaka', 'IN', NULL, 'gym', '{snack}', 1100, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-13T17:13:54.862Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Auto Repair Shop need ATM 10469', 'Auto Repair Shop needs ATM service', 'auto', 'The Bronx', 'NY', NULL, 'other', '{custom}', 320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-13T16:47:43.466Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'High rise residential - ATM broken', 'High rise residential tower, broken ATM, 300+ units', 'apartment', 'Jacksonville', 'FL', NULL, 'apartment', '{custom}', 1010, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-13T16:06:40.994Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Hotel needs ATM 43068', '$50 Cash deposit policy, 98 guest capacity', 'hotel', 'Reynoldsburg', 'OH', NULL, 'hotel', '{custom}', 830, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-13T14:46:38.365Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'RETRO 1980S THEMED MACHINE', 'Fitness gym with store front, 3000+ members', 'gym', 'Glendale', 'CA', NULL, 'gym', '{custom}', 700, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-12T23:46:34.247Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Gym needs vending services 13205', 'Gym needs vending services, limited space', 'gym', 'Syracuse', 'NY', NULL, 'gym', '{snack}', 610, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-12T07:45:51.231Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Micro Mart for a Hotel 100Rooms+', '109 rooms hotel, needs an operator', 'hotel', 'Springfield', 'IL', NULL, 'hotel', '{snack}', 900, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-11T15:31:05.988Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Combo Machine needed in Montgomery, AL', 'Automotive shop urgently wanting a combo machine', 'auto', 'Montgomery', 'AL', NULL, 'other', '{snack}', 250, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-11T07:57:36.274Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'GYM', 'GYM', 'gym', 'Detroit', 'MI', NULL, 'gym', '{snack}', 340, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-10T20:00:28.445Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Motel in Augusta needs vending services', 'Location in Augusta, Georgia is looking for a vending operator.', 'hotel', 'Augusta', 'GA', NULL, 'hotel', '{snack}', 750, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-10T15:17:19.871Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Apartment complex', '5 block apartment complex with 100 units', 'apartment', 'Cincinnati', 'OH', NULL, 'apartment', '{snack}', 500, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-09T18:58:47.599Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Laundromat in Plainville, Connecticut needs ATM', 'Location in Plainville, Connecticut looking for ATM operator.', 'laundromat', 'Plainville', 'CT', NULL, 'other', '{custom}', 400, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-09T18:31:05.638Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Barber shop 70714 needs vending services', 'Location in Baker, Louisiana is looking for a vending operator.', 'barbershop', 'Baker', 'LA', NULL, 'retail', '{snack}', 360, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-08T18:09:43.148Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'HIGH-TRAFFIC RETAIL - 2 ARCADE MACHINE PLACEMENT', 'Busy retail store, 100+ customers daily, looking for arcade machines', 'shop', 'Clovis', 'NM', NULL, 'retail', '{custom}', 400, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-07T21:34:15.577Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '1000+ customers daily very successful store', 'Family/convenience store in middle of downtown', 'shop', 'Ravenna', 'OH', NULL, 'retail', '{snack}', 600, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-07T17:20:10.635Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Immediate need near 26062 to replace current vendor', '35 employees, ready to replace current vendor', 'manufacturing', 'Weirton', 'WV', NULL, 'warehouse', '{snack}', 800, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-06T18:37:08.916Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '2-star hotel in 65616 needs vending services', 'Location in Branson, Missouri is looking for a vending operator.', 'hotel', 'Branson', 'MO', NULL, 'hotel', '{snack}', 680, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-05T21:38:51.627Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in North Little Rock, Arkansas needs vending', 'Location in North Little Rock, Arkansas, wants someone to bring a machine', 'office', 'North Little Rock', 'AR', NULL, 'office', '{snack}', 810, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-05T20:16:15.880Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Hotel 90063 Seeking ATM services', 'Location in Los Angeles, California is looking for ATM operator.', 'hotel', 'Los Angeles', 'CA', NULL, 'hotel', '{custom}', 680, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-05T18:20:51.454Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Lakewood Ranch, Florida needs vending', 'Location in Lakewood Ranch, Florida is looking for a vending operator.', 'barbershop', 'Bradenton', 'FL', NULL, 'retail', '{snack}', 420, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-05T15:42:27.320Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Chico, California needs vending', 'Location in Chico, California is looking for a vending operator.', 'hotel', 'Chico', 'CA', NULL, 'hotel', '{snack}', 750, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-04T21:16:21.781Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in El Paso, Texas needs vending', 'Location in El Paso, Texas is looking for a vending operator.', 'gym', 'El Paso', 'TX', NULL, 'gym', '{snack}', 550, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-04T19:51:12.821Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Monterey Park, California needs vending', 'Location in Monterey Park, California is looking for a vending operator.', 'hotel', 'Monterey Park', 'CA', NULL, 'hotel', '{coffee}', 750, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-04T19:11:50.329Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'ATM Famous Tattoo Artist', 'Famous tattoo artist needs ATM near door', 'shop', 'Chicago', 'IL', NULL, 'retail', '{custom}', 540, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-03T19:12:32.634Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '100+ Unit Apartment complex in Athens GA', 'Big Apartment Complex with over 100 units, fully rented', 'apartment', 'Athens', 'GA', NULL, 'apartment', '{snack}', 1000, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-03T17:41:47.763Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Convenience store needs ATM', '5 year signed contract for a convenience store, 24/7', 'shop', 'Philadelphia', 'PA', NULL, 'retail', '{custom}', 650, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-02T17:28:48.055Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Big Apartment Complex in Amarillo TX', 'Big apartment complex, 240 units', 'apartment', 'Amarillo', 'TX', NULL, 'apartment', '{snack}', 1000, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-02T00:44:55.045Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Busy Automotive place', 'Busy Automotive place, wants a snack machine only', 'auto', 'Henderson', 'TX', NULL, 'other', '{snack}', 600, 'open', 'email', true, 'contracted', 'flexible', false, '2026-03-02T00:40:43.885Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Large Condominium on the Beach', 'Condominium with 168 units, wants Sunblock Vending machine', 'apartment', 'Destin', 'FL', NULL, 'apartment', '{custom}', 980, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-27T23:53:19.332Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in McDonough, Georgia needs vending', 'Location in McDonough, Georgia is looking for a vending operator.', 'gym', 'McDonough', 'GA', NULL, 'gym', '{snack}', 450, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-27T18:17:39.851Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MINUTES FROM GAINESVILLE', 'Need smart cooler, huge outdoor events every weekend', 'community', 'Gainesville', 'FL', NULL, 'other', '{snack}', 810, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-27T04:34:41.761Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Miami, Florida needs vending', 'Hotel looking for snack/drink combo and travel items', 'hotel', 'Miami', 'FL', NULL, 'hotel', '{snack}', 650, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-26T21:58:22.092Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '3 star hotel in Lansing needs vending services', '3 star hotel needs vending services', 'hotel', 'Lansing', 'MI', NULL, 'hotel', '{snack}', 750, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-26T15:49:08.706Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '2 star hotel 31901 needs vending', '2 star hotel in Columbus, Georgia', 'hotel', 'Columbus', 'GA', NULL, 'hotel', '{snack}', 750, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-26T14:28:11.669Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Busy Transmission Shop in Wichita Falls TX', 'Busy transmission shop, 30-40 customers daily', 'auto', 'Wichita Falls', 'TX', NULL, 'other', '{snack}', 600, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-26T04:13:56.888Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Busy Motel in Payson AZ', 'Busy Motel with 46 rooms', 'hotel', 'Payson', 'AZ', NULL, 'hotel', '{snack}', 990, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-26T04:09:42.537Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Busy Inn in Arizona', 'Busy Inn in Lake Havasu City', 'hotel', 'Lake Havasu City', 'AZ', NULL, 'hotel', '{snack}', 990, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-26T04:05:27.913Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '3 star hotel needs vending services 94103', 'Hotel in San Francisco needs vending services', 'hotel', 'San Francisco', 'CA', NULL, 'hotel', '{snack}', 430, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-26T01:01:43.144Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '2 star hotel with 40 rooms', 'Busy 2 star hotel with 40 rooms', 'hotel', 'Parker', 'AZ', NULL, 'hotel', '{snack}', 1180, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-25T00:02:47.015Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Vending Opportunity at Club House Pool', 'High-Traffic Club House Pool, 30-50 visitors per day', 'community', 'Kill Devil Hills', 'NC', NULL, 'other', '{snack}', 600, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-24T16:59:45.658Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Stand Alone, San Angelo, TX, 76903', 'Fitness Center with 100+ daily traffic, 24/7', 'gym', 'San Angelo', 'TX', NULL, 'gym', '{snack}', 780, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-24T16:41:03.978Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Auto repair shop needs vending services 48340', 'Small auto repair shop needs vending services', 'auto', 'Pontiac', 'MI', NULL, 'other', '{snack}', 320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-23T23:45:47.663Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Auto repair shop needs vending services 15203', 'Small auto repair shop needs combo machine', 'auto', 'Pittsburgh', 'PA', NULL, 'other', '{snack}', 250, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-23T23:26:44.799Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Gym Needs vending services 48207', 'Mid sized gym needs vending services', 'gym', 'Detroit', 'MI', NULL, 'gym', '{snack}', 440, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-23T23:05:13.840Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Auto Repair Shop needs combo machine 46723', 'Small auto shop seeking food and drink vending', 'auto', 'Churubusc', 'IN', NULL, 'other', '{snack}', 320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-23T22:31:08.104Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Auto Repair Shop needs ATM 10451', 'Small auto shop needs ATM', 'auto', 'The Bronx', 'NY', NULL, 'other', '{custom}', 320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-23T22:08:20.933Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Company near zip 16161 poor customer service', 'Manufacturing facility evaluating alternative vendors', 'manufacturing', 'Wheatland', 'PA', NULL, 'warehouse', '{snack}', 800, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-23T20:31:17.905Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Facility near 29485 looking to replace current vendor', '110 employees 24/7 operation', 'hospital', 'Summerville', 'SC', NULL, 'hospital', '{snack}', 900, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-23T19:25:05.534Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Santa Rosa Beach, Florida needs vending', 'Location in Santa Rosa Beach, Florida is looking for a vending operator.', 'gym', 'Santa Rosa Beach', 'FL', NULL, 'gym', '{snack}', 580, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-23T15:29:40.039Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Events center in Georgia', 'Busy children fun center, open to 1-2 machines', 'warehouse', 'Thomaston', 'GA', NULL, 'warehouse', '{snack}', 1000, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-18T17:17:20.876Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Manufacturing Plant near columbus', 'Manufacturing plant, 65-70 employees, replacing current vendor', 'production', 'London', 'OH', NULL, 'warehouse', '{snack}', 920, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-17T21:57:46.445Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Salon needs ATM services 89052', 'Location in Henderson, Nevada', 'barbershop', 'Henderson', 'NV', NULL, 'retail', '{custom}', 400, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-17T19:26:15.702Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Home, Syracuse, IN, 46567', 'Recovery center with 6 Employees and 20+ daily Traffic', 'publicservice', 'Syracuse', 'IN', NULL, 'government', '{snack}', 650, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-12T22:45:37.655Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Detroit auto shop needs vending service 48120', 'Auto repair shop, 21-40 customers per day', 'auto', 'Detroit', 'MI', NULL, 'other', '{snack}', 360, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-12T14:46:38.953Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Health services center', 'Health service center, patients live there', 'hospital', 'North East', 'MD', NULL, 'hospital', '{snack}', 1000, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-09T23:00:26.169Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Refuge Temple Revival Center', 'Church/ministry', 'church', 'Indianapolis', 'IN', NULL, 'other', '{snack}', 360, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-09T21:27:01.695Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Foley, Alabama needs vending', 'Location in Foley, Alabama is looking for a vending operator.', 'barbershop', 'Foley', 'AL', NULL, 'retail', '{snack}', 400, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-09T21:21:40.648Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Busy I-10 Hotel in Crestview, FL needs Vape Machine', 'Hotel in Crestview FL right next to I-10', 'hotel', 'Crestview', 'FL', NULL, 'hotel', '{snack}', 450, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-09T07:59:03.523Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Hotel in Crestview, FL needs Claw machine', 'Hotel in Crestview FL needs a claw machine', 'hotel', 'Crestview', 'FL', NULL, 'hotel', '{custom}', 450, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-09T07:55:36.400Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Owner APPROVED! Hotel in Crestview needs ATM', 'Placement approved, ATM in lobby with cameras', 'hotel', 'Crestview', 'FL', NULL, 'hotel', '{custom}', 450, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-09T07:49:21.173Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Owner APPROVED! Location in Crestview needs vending', 'Owner approved, ready for at least 2 machines', 'hotel', 'Crestview', 'FL', NULL, 'hotel', '{snack}', 450, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-09T07:45:47.634Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Company near 68801 does not have vending machines', '29 employees, no vending on site', 'transportation', 'Grand Island', 'NE', NULL, 'other', '{snack}', 800, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-08T20:19:58.675Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Coin Car Wash in Tallahassee', '24hrs Car Wash open to drink or snack vending', 'auto', 'Tallahassee', 'FL', NULL, 'other', '{snack}', 270, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-07T17:57:18.873Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Busy Clothing Store in Fort Worth Texas', 'Busy clothing store in Fort Worth', 'shop', 'Fort Worth', 'TX', NULL, 'retail', '{snack}', 600, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-05T21:43:59.499Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Barber Shop 25401 needs ATM', 'Barber Shop in Martinsburg needs ATM', 'barbershop', 'Martinsburg', 'WV', NULL, 'retail', '{custom}', 320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-05T15:52:12.851Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Barber shop needs vending services 25401', 'Location in Martinsburg, West Virginia', 'barbershop', 'Martinsburg', 'WV', NULL, 'retail', '{snack}', 320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-04T17:19:21.694Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Barbershop needs vending services 48221', 'Location in Detroit, Michigan', 'barbershop', 'Detroit', 'MI', NULL, 'retail', '{snack}', 320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-03T21:29:28.414Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Busy Tint shop in MD', 'Very busy tint shop in Maryland', 'auto', 'Baltimore', 'MD', NULL, 'other', '{snack}', 660, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-03T19:24:14.266Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Senior Living Facility 24/7', 'Combo or drink/snack machine for assisted living', 'hospital', 'College Station', 'TX', NULL, 'hospital', '{snack}', 600, 'open', 'email', true, 'contracted', 'flexible', false, '2026-02-02T15:49:32.591Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Greenville, Texas needs vending', 'Location in Greenville, Texas is looking for a vending operator.', 'hotel', 'Greenville', 'TX', NULL, 'hotel', '{snack}', 410, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-31T02:17:19.836Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Busy Auto place in Miami FL', 'Busy Auto Tech in Miami FL, replacement, move in ready', 'auto', 'Miami', 'FL', NULL, 'other', '{snack}', 240, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-29T15:55:43.137Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '300 unit apartment building', '300 units apartment building with pool and gym', 'apartment', 'Baytown', 'TX', NULL, 'apartment', '{snack}', 1520, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-28T18:33:26.149Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Busy Tattoo Shop in Phoenix AZ', 'Busy tattoo place, 30+ customers a day', 'shop', 'Phoenix', 'AZ', NULL, 'retail', '{snack}', 540, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-26T23:45:07.183Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Bakersfield, California needs vending', 'Location in Bakersfield, California', 'gym', 'Bakersfield', 'CA', NULL, 'gym', '{snack}', 650, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-21T20:44:49.112Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Warehouse, Granbury, TX, 76049', 'Fitness Gym, 60+ daily foot traffic, 7 days a week', 'gym', 'Granbury', 'TX', NULL, 'gym', '{snack}', 780, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-21T16:09:18.898Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Warehouse 50+ employees - Great location!', 'Warehouse location, 51 employees, smart cooler setup', 'warehouse', 'Portland', 'OR', NULL, 'warehouse', '{snack}', 600, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-21T07:23:34.428Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'BARBERSHOP NEEDS VENDING MACHINE', 'Modern barbershop with 20+ loyal customers daily', 'barbershop', 'Mount Olive', 'NC', NULL, 'retail', '{snack}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-21T06:07:45.775Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Newark, Ohio needs vending', 'Location in Newark, Ohio is looking for a vending operator.', 'shop', 'Newark', 'OH', NULL, 'retail', '{snack}', 500, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-17T23:12:37.411Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'REPLACE COFFEE VENDOR ASAP', 'Fitness center wants coffee machine, 100+ day avg traffic', 'gym', 'La Habra', 'CA', NULL, 'gym', '{coffee}', 700, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-14T22:10:38.249Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Montgomery, Alabama needs vending', 'Location in Montgomery, Alabama', 'gym', 'Montgomery', 'AL', NULL, 'gym', '{snack}', 500, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-13T17:56:05.175Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Busy Salon in Cali', 'Nice modern salon, 10 chairs, steady flow of customers', 'barbershop', 'Glendora', 'CA', NULL, 'retail', '{snack}', 400, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-12T20:33:29.468Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Poor Customer Service! Replace 4 machines in Zip 43701', 'Secured building, 2 beverage and 2 snack machines currently', 'apartment', 'Zanesville', 'OH', NULL, 'apartment', '{snack}', 500, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-08T20:28:59.207Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Belleville, Kansas needs vending', 'Location in Belleville, Kansas', 'laundromat', 'Belleville', 'KS', NULL, 'other', '{snack}', 375, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-06T23:04:46.318Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Beech Creek, Pennsylvania needs vending', 'Location in Beech Creek, Pennsylvania', 'laundromat', 'Beech Creek', 'PA', NULL, 'other', '{custom}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-06T22:35:32.500Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Exclusive Mixed Martial Arts Gym', 'Fast growing mixed martial arts gym', 'gym', 'Struthers', 'OH', NULL, 'gym', '{snack}', 500, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-03T13:37:10.666Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'AUTO SHOP NEEDS DRINKS/SNACKS MACHINE', 'Mom and pop auto shop in Miami', 'auto', 'Miami', 'FL', NULL, 'other', '{snack}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-02T17:41:06.136Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Winston-Salem, NC needs ATM Machine', 'Barber shop, 20+ heads daily, steady traffic', 'barbershop', 'Winston-Salem', 'NC', NULL, 'retail', '{custom}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2026-01-02T17:25:18.752Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Gamers for Restaurant & Bar', 'Video games needed for restaurant and bar', 'shop', 'Chicago', 'IL', NULL, 'retail', '{custom}', 350, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-31T22:22:35.294Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Gamers II for Restaurant & Bar', 'A video game for restaurant and bar', 'shop', 'Chicago', 'IL', NULL, 'retail', '{custom}', 360, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-31T22:15:45.440Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Coffee Vending Location - BUSY GAS STATION', 'Busy gas station seeking coffee vending operator', 'shop', 'Addison', 'IL', NULL, 'retail', '{coffee}', 250, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-31T00:12:56.767Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'PRIME OUTDOOR VENDING LOCATION', 'Outdoor vending opportunity on privately owned property', 'apartment', 'Shelburne', 'ON', NULL, 'apartment', '{snack}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-24T13:31:01.548Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Columbus, Ohio needs vending', 'Location in Columbus, Ohio', 'laundromat', 'Columbus', 'OH', NULL, 'other', '{custom}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-21T19:15:02.200Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'ATM', 'Far from any ATM, needs a small percentage', 'shop', 'Chicago', 'IL', NULL, 'retail', '{custom}', 400, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-18T18:13:49.445Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Location in Toronto, Ontario needs vending', 'Location in Toronto, Ontario', 'laundromat', 'York', 'ON', NULL, 'other', '{snack}', 200, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-17T21:13:25.554Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'ATM, Diversey Busy Area', 'Hair dresser needs an ATM', 'barbershop', 'Chicago', 'IL', NULL, 'retail', '{custom}', 420, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-16T23:36:15.993Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Near Zip 57702! 4 machines!', 'Very high volume location, 3 buildings, 100-300 employees', 'community', 'Rapid City', 'SD', NULL, 'other', '{snack}', 1000, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-16T22:26:57.559Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Coffee Machine for a Busy Grocery Store', 'Machine needed for wholesale food store', 'shop', 'Chicago', 'IL', NULL, 'retail', '{custom}', 370, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-16T19:20:20.201Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'ATM Male Hair Salon', 'ATM needed hair salon', 'barbershop', 'Chicago', 'IL', NULL, 'retail', '{custom}', 340, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-15T19:25:39.873Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'The mall shopping Center in Santa Maria, California', 'The mall, looking for key making and drink machines', 'community', 'Santa Maria', 'CA', NULL, 'other', '{snack}', 1350, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-11T19:44:16.391Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Music Box for a Bar and Restaurant', '1 Karaoke Machine Wanted', 'shop', 'Chicago', 'IL', NULL, 'retail', '{custom}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-09T21:33:58.750Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Company looking for snack and coffee machines in zip 53188', 'Company interested in coffee and snacks', 'manufacturing', 'Waukesha', 'WI', NULL, 'warehouse', '{snack}', 350, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-04T21:25:53.818Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Stand Alone Bldg, Charleston, WV, 25304', 'Fitness Center, 300 to 500 daily traffic', 'gym', 'Charleston', 'WV', NULL, 'gym', '{snack}', 1500, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-04T16:18:56.649Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Nice Apartment Complex in MD', 'Contract signed, 2 spots available for machines', 'apartment', 'Brentwood', 'MD', NULL, 'apartment', '{snack}', 540, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-04T01:24:13.266Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Two busy gymnastic places', 'Two gymnastic places, 500+ students per week each', 'gym', 'Boerne', 'TX', NULL, 'gym', '{snack}', 800, 'open', 'email', true, 'contracted', 'flexible', false, '2025-12-01T15:30:25.904Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'CAR DEALERSHIP PALM BAY FL', 'Constant traffic 30-70 a day, 7 days a week', 'auto', 'Palm Bay', 'FL', NULL, 'other', '{snack}', 500, 'open', 'email', true, 'contracted', 'flexible', false, '2025-11-28T21:26:33.642Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Commercial Warehouse in Orlando, Florida 32811', 'Commercial Warehouse, 100+ people walking in daily', 'warehouse', 'Orlando', 'FL', NULL, 'warehouse', '{snack}', 450, 'open', 'email', true, 'contracted', 'flexible', false, '2025-11-26T18:22:09.630Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Hotel in Ridgecrest', 'Hotel/motel, 1 year agreement signed and finalized', 'hotel', 'Ridgecrest', 'CA', NULL, 'hotel', '{snack}', 1300, 'open', 'email', true, 'contracted', 'flexible', false, '2025-11-19T17:55:32.637Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'New account for sale', '5 HAHA coolers and 1 combo machine, two year contract', 'warehouse', 'Baltimore', 'MD', NULL, 'warehouse', '{snack}', 150000, 'open', 'email', true, 'contracted', 'flexible', false, '2025-11-16T09:59:26.587Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Staten Island NY Luxury Apartments', 'Luxury Apartments, 120+ units, 180-200+ people', 'apartment', 'Staten Island', 'NY', NULL, 'apartment', '{snack}', 2200, 'open', 'email', true, 'contracted', 'flexible', false, '2025-11-14T12:47:11.697Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Warehouse, Huntington, WV, 25701', 'Boxing Gym, 50+ daily foot traffic', 'gym', 'Huntington', 'WV', NULL, 'gym', '{snack}', 650, 'open', 'email', true, 'contracted', 'flexible', false, '2025-11-13T22:18:10.756Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Gym/Fitness Center in Jackson, Wyoming', 'Active gym in Jackson Wyoming', 'gym', 'Jackson', 'WY', NULL, 'gym', '{snack}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2025-11-13T00:30:33.323Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Auto Repair Shop Lansdowne 19050', '1 Employee Auto Shop runs 6 days a week', 'auto', 'East Lansdowne', 'PA', NULL, 'other', '{snack}', 450, 'open', 'email', true, 'contracted', 'flexible', false, '2025-11-12T22:38:08.157Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Gym/Fitness Center in Saratoga, Wyoming', '24/7 gym with no vending machines', 'gym', 'Saratoga', 'WY', NULL, 'gym', '{snack}', 400, 'open', 'email', true, 'contracted', 'flexible', false, '2025-11-12T21:12:53.775Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Tattoo shop in Laramie Wyoming', 'Very popular tattoo shop with great reviews', 'barbershop', 'Laramie', 'WY', NULL, 'retail', '{snack}', 200, 'open', 'email', true, 'contracted', 'flexible', false, '2025-11-12T02:34:03.790Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Auto Services Facility in Charles Town, WV', 'Auto Center, 13 Employees, 20+ daily foot traffic', 'auto', 'Charles Town', 'WV', NULL, 'other', '{snack}', 500, 'open', 'email', true, 'contracted', 'flexible', false, '2025-11-11T20:10:38.115Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Auto Business in Venice FL 34285', '4 employees, interested in combo drink/snack machine', 'office', 'Venice', 'FL', NULL, 'office', '{snack}', 540, 'open', 'email', true, 'contracted', 'flexible', false, '2025-10-30T18:03:25.837Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Auto service facility in tx 78644', '6 employees, requesting snack and coke machine', 'auto', 'Lockhart', 'TX', NULL, 'other', '{snack}', 490, 'open', 'email', true, 'contracted', 'flexible', false, '2025-10-29T15:50:00.219Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Carlot', 'Carlot in the center of the cities main attraction area', 'auto', 'Union City', 'TN', NULL, 'other', '{snack}', 1200, 'open', 'email', true, 'contracted', 'flexible', false, '2025-10-20T18:12:45.377Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Storefront in Lockhart, 78644', 'Combo, 3 employees', 'gym', 'Lockhart', 'TX', NULL, 'gym', '{snack}', 250, 'open', 'email', true, 'contracted', 'flexible', false, '2025-10-16T21:02:33.293Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Plaza, Saginaw, TX, 76179', 'Established Pet Store, 150+ daily foot traffic', 'publicservice', 'Saginaw', 'TX', NULL, 'government', '{snack}', 800, 'open', 'email', true, 'contracted', 'flexible', false, '2025-10-16T17:02:09.070Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Drink for employees', 'Will be placed in shop for employees', 'auto', 'Cedar Park', 'TX', NULL, 'other', '{snack}', 500, 'open', 'email', true, 'contracted', 'flexible', false, '2025-10-14T19:43:15.796Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Stand Alone, Fort Worth, TX, 76244', 'Pet Store, 14 Employees, 130+ daily foot traffic', 'shop', 'Fort Worth', 'TX', NULL, 'retail', '{snack}', 900, 'open', 'email', true, 'contracted', 'flexible', false, '2025-10-09T16:24:36.218Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Strip Mall, Rockledge, FL, 32955', 'Popular Gym, 70+ minimum foot traffic, 7 days', 'gym', 'Rockledge', 'FL', NULL, 'gym', '{snack}', 700, 'open', 'email', true, 'contracted', 'flexible', false, '2025-09-22T15:46:02.771Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Coin/bill changer needed at laundromat Lauderhill', 'Laundromat needs coin and bill changer, 60+ traffic', 'laundromat', 'Lauderhill', 'FL', NULL, 'other', '{snack}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2025-09-20T19:27:43.954Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Transportation Company Huntsville, ON CANADA', 'Transportation Company, 16 Employees', 'office', 'Huntsville', 'ON', NULL, 'office', '{snack}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2025-09-19T04:48:35.219Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Plaza, Pensacola, FL, 32504', 'Yoga studio growing quick, 35+ daily traffic', 'publicservice', 'Pensacola', 'FL', NULL, 'government', '{snack}', 500, 'open', 'email', true, 'contracted', 'flexible', false, '2025-09-17T16:55:08.843Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'New Vending Location - West Lafayette, IN', 'Ready-to-go location for 2 machines, 70-80 employees', 'hospital', 'West Lafayette', 'IN', NULL, 'hospital', '{snack}', 700, 'open', 'email', true, 'contracted', 'flexible', false, '2025-09-10T18:48:59.888Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Plaza, Houston, TX, 77084', '4 Employees ATM Machine, 7 days a week', 'barbershop', 'Houston', 'TX', NULL, 'retail', '{snack}', 350, 'open', 'email', true, 'contracted', 'flexible', false, '2025-07-29T16:14:12.580Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Warehouse requesting a combo machine', 'Warehouse requesting combo machine, 7-9 employees', 'warehouse', 'Kyle', 'TX', NULL, 'warehouse', '{snack}', 350, 'open', 'email', true, 'contracted', 'flexible', false, '2025-07-28T20:57:35.549Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Warehouse, Lockport, NY, 14094 ATM', '3 to 5 Employees ATM machine, warehouse', 'production', 'Lockport', 'NY', NULL, 'warehouse', '{custom}', 350, 'open', 'email', true, 'contracted', 'flexible', false, '2025-07-24T16:37:07.016Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Warehouse, Lockport, NY, 14094 Combo', '3 to 5 Employees, combo snack and drink', 'production', 'Lockport', 'NY', NULL, 'warehouse', '{snack}', 400, 'open', 'email', true, 'contracted', 'flexible', false, '2025-07-24T16:20:53.542Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Stand Alone Bld, AL, 36535', '6 Employees ATM machine request', 'shop', 'Foley', 'AL', NULL, 'retail', '{custom}', 375, 'open', 'email', true, 'contracted', 'flexible', false, '2025-07-17T16:11:16.921Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Warehouse, Antioch, CA-94509 combo', '3 Employees, combo snack and drink, limited space', 'warehouse', 'Antioch', 'CA', NULL, 'warehouse', '{snack}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2025-07-15T15:28:43.156Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Warehouse, Antioch, CA, 94509 transport', '5 employees, combo machine in lobby', 'transportation', 'Antioch', 'CA', NULL, 'other', '{snack}', 320, 'open', 'email', true, 'contracted', 'flexible', false, '2025-07-12T21:15:03.114Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Plaza Building', '6 Employees, drink and snack combo', 'shop', 'Brooksville', 'FL', NULL, 'retail', '{snack}', 800, 'open', 'email', true, 'contracted', 'flexible', false, '2025-07-11T18:23:22.587Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Stand Alone Building', '5 Employees wants snack and drink', 'shop', 'Burleson', 'TX', NULL, 'retail', '{snack}', 275, 'open', 'email', true, 'contracted', 'flexible', false, '2025-07-09T20:00:35.820Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Car/truck Wash Snack and/or Drink or Combo Machine', 'Car and truck wash interested in snack/drink machine', 'auto', 'Airdrie', 'AB', NULL, 'other', '{snack}', 300, 'open', 'email', true, 'contracted', 'flexible', false, '2025-04-23T17:10:13.568Z', now(), 'Vending Connector');

END $$;

-- Total: 222 listings inserted
