-- Generated location listings data
-- Run migration 059_lead_type.sql FIRST, then run this script

-- Delete all existing vending_requests except York PA
DELETE FROM vending_requests WHERE NOT (city = 'York' AND state = 'PA');

-- Insert new contracted location listings
-- Uses the first admin user as the creator
DO $$
DECLARE admin_id uuid;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email = 'james@apexaivending.com' LIMIT 1;
  IF admin_id IS NULL THEN
    SELECT id INTO admin_id FROM profiles LIMIT 1;
  END IF;

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX OPPURTUNITY!', 'Apartment Building in Louisville, KY', 'Apartment Building', 'Louisville', 'KY', '40272', 'apartment', '{}', 1210, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX OPPURTUNITY!', 'Apartment Building in Prattville, AL', 'Apartment Building', 'Prattville', 'AL', '36066', 'apartment', '{}', 990, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX OPPURTUNITY!', 'Apartment Building in Springfield, IL', 'Apartment Building', 'Springfield', 'IL', '62704', 'apartment', '{}', 946, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX OPPURTUNITY!', 'Apartment Building in Independence, MO', 'Apartment Building', 'Independence', 'MO', '64057', 'apartment', '{}', 748, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX OPPURTUNITY!', 'Apartment Building in Madison, WI', 'Apartment Building', 'Madison', 'WI', '53719', 'apartment', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX OPPURTUNITY!', 'Apartment Building in Gurnee, IL', 'Apartment Building', 'Gurnee', 'IL', '60031', 'apartment', '{}', 1540, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 10 EMPS 12 CUSTOMERS!', 'Office in Houston, TX', 'Office', 'Houston', 'TX', '77021', 'office', '{}', 462, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX OPPURTUNITY!', 'Apartment Building in Port Huron, MI', 'Apartment Building', 'Port Huron', 'MI', '48060', 'apartment', '{}', 902, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX OPPURTUNITY!', 'Apartment Building in Richmond, VA', 'Apartment Building', 'Richmond', 'VA', '23231', 'apartment', '{}', 902, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX OPPURTUNITY!', 'Apartment Building in Battle Creek, MI', 'Apartment Building', 'Battle Creek', 'MI', '49014', 'apartment', '{}', 1034, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING 30 EMPS CARD ALLOWANCE!', 'Manufacturing Facility in River Falls, WI', 'Manufacturing Facility', 'River Falls', 'WI', '54022', 'warehouse', '{}', 682, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX OPPURTUNITY!', 'Apartment Building in Jackson, MS', 'Apartment Building', 'Jackson', 'MS', '39211', 'apartment', '{}', 1100, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX OPPURTUNITY!', 'Apartment Building in Augusta, GA', 'Apartment Building', 'Augusta', 'GA', '30906', 'apartment', '{}', 968, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX OPPURTUNITY!', 'Apartment Building in Macon, GA', 'Apartment Building', 'Macon', 'GA', '31220', 'apartment', '{}', 880, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '2 APARTMENT BUILDING/COMPLEX OPPURTUNITY!', 'Apartment Building in Evansville, IN', 'Apartment Building', 'Evansville', 'IN', '47715', 'apartment', '{}', 990, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX 4EMPS 385+RES!', 'Apartment Building in Saint Joseph, MO', 'Apartment Building', 'Saint Joseph', 'MO', '64506', 'apartment', '{}', 968, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX 4EMPS 208+RES!', 'Apartment Building in Lexington, KY', 'Apartment Building', 'Lexington', 'KY', '40517', 'apartment', '{}', 968, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX 4EMPS 246+RES!', 'Apartment Building in Lincoln, NE', 'Apartment Building', 'Lincoln', 'NE', '68504', 'apartment', '{}', 748, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX 4EMPS 192+RES!', 'Apartment Building in Columbia, MI', 'Apartment Building', 'Columbia', 'MI', '48187', 'apartment', '{}', 924, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX 4EMPS 112+RES!', 'Apartment Building in Auburn, AL', 'Apartment Building', 'Auburn', 'AL', '36830', 'apartment', '{}', 616, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX 4EMPS 112+RES!', 'Apartment Building in Swartz Creek, MI', 'Apartment Building', 'Swartz Creek', 'MI', '48473', 'apartment', '{}', 924, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '2 APARTMENT BUILDING/COMPLEX OPPURTUNITY!', 'Apartment Building in Tallahassee, FL', 'Apartment Building', 'Tallahassee', 'FL', '32304', 'apartment', '{}', 1012, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '3 APARTMENT BUILDING/COMPLEX OPPURTUNITY!', 'Apartment Building in Mobile, AL', 'Apartment Building', 'Mobile', 'AL', '36609', 'apartment', '{}', 1078, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT COMPLEX 6 EMPS 300 RESIDENTS!', 'Apartment Complex in Harker Heights, TX', 'Apartment Complex', 'Harker Heights', 'TX', '76548', 'apartment', '{}', 924, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'GROWING OFFICE!', 'Office in Fort Walton Beach, FL', 'Office', 'Fort Walton Beach', 'FL', '32548', 'office', '{}', 550, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'SEASONAL LIVING FACILITY 14-300+RES!', 'Facility in Palm Desert, CA', 'Facility', 'Palm Desert', 'CA', '92211', 'other', '{}', 880, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'CAR DEALER 35 EMPS!', 'Car Wash in Cumming, GA', 'Car Wash', 'Cumming', 'GA', '30041', 'other', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 100+EMPS!', 'Facility in Brooksville, FL', 'Facility', 'Brooksville', 'FL', '34604', 'other', '{}', 1540, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'RETAIL ESTABLISHMENT 2 EMPS 15 CUSTOMERS!', 'Retail Establishment in Braceville, IL', 'Retail Establishment', 'Braceville', 'IL', '60407', 'retail', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'COMMUNITY CLUBHOUSE 800+ RES!', 'Community Clubhouse in Indian Trail, NC', 'Community Clubhouse', 'Indian Trail', 'NC', '28079', 'other', '{}', 1320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 30 EMPS!', 'Office in Glen Allen, VA', 'Office', 'Glen Allen', 'VA', '23060', 'office', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING/COMPLEX 4EMPS 112+RES!', 'Apartment Building in Muskegon, MI', 'Apartment Building', 'Muskegon', 'MI', '49442', 'apartment', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 50 EMPS!', 'Office in Waterloo, IA', 'Office', 'Waterloo', 'IA', '50701', 'office', '{}', 902, 'open', 'email', true, 'contracted', 'flexible', false, '2026-05-01T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '2 APTS 600 RES! ( COFFEE SERVICE)', 'Apartment Building in Knoxville, TN', 'Apartment Building', 'Knoxville', 'TN', '37920', 'apartment', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 8 EMPS 11 CUSTOMERS!', 'Facility in Easley, SC', 'Facility', 'Easley', 'SC', '29640', 'other', '{}', 418, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'WAREHOUSE 40EMPS!', 'Warehouse in Laramie, WY', 'Warehouse', 'Laramie', 'WY', '82070', 'warehouse', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'PRODUCTION 75 EMPS!', 'Production Facility in Steele, AL', 'Production Facility', 'Steele', 'AL', '35987', 'warehouse', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'ASSISTED LIVING FACILITY 8+EMPS 18+RES!', 'Assisted Living Facility in Moorhead, MN', 'Assisted Living Facility', 'Moorhead', 'MN', '56560', 'hospital', '{}', 418, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING 30EMPS!', 'Manufacturing Facility in Griffin, GA', 'Manufacturing Facility', 'Griffin', 'GA', '30224', 'warehouse', '{}', 968, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 3000 EMPS!', 'Facility in Miami, TX', 'Facility', 'Miami', 'TX', '79059', 'other', '{}', 2200, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 50EMPS!', 'Facility in Bay City, MI', 'Facility', 'Bay City', 'MI', '48706', 'other', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'LIVING FACILITY 100 RES!', 'Facility in Bloomington, IN', 'Facility', 'Bloomington', 'IN', '47406', 'other', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'WAREHOUSE 70 EMPS!', 'Warehouse in Denver, CO', 'Warehouse', 'Denver', 'CO', '80229', 'warehouse', '{}', 1078, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 25 HUNGRY EMPS!', 'Office in North Haven, CT', 'Office', 'North Haven', 'CT', '06473', 'office', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'HOTEL 50-60 GUESTS!', 'Hotel / Motel in Springhill, LA', 'Hotel / Motel', 'Springhill', 'LA', '71075', 'hotel', '{}', 594, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OUTDOOR FACILITY 72 GUESTS 6 EMPS!', 'Outdoor Facility in South Haven, MI', 'Outdoor Facility', 'South Haven', 'MI', NULL, 'other', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE COMPLEX 100 EMPS, 40 VIS!', 'Office in Washington, DC', 'Office', 'Washington', 'DC', '20037', 'office', '{}', 1320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '3 OFFICE LOCATION OPPURTUNITY! (COFFEE)', 'Office in Black Hawk, CO', 'Office', 'Black Hawk', 'CO', '80422', 'office', '{}', 1980, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 700 EMPS!', 'Facility in Hubbard, TX', 'Facility', 'Hubbard', 'TX', '76648', 'other', '{}', 1320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 50+EMPS!', 'Office in San Tan Valley, AZ', 'Office', 'San Tan Valley', 'AZ', '85140', 'office', '{}', 968, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 10EMPS 100+STUDENTS!', 'Facility in Beverly, MA', 'Facility', 'Beverly', 'MA', '01915', 'other', '{}', 1100, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'AST.LIVING 75 EMPS, 30 VIS!', 'Assisted Living Facility in Venice, FL', 'Assisted Living Facility', 'Venice', 'FL', '34285', 'hospital', '{}', 1078, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'DISTRIBUTION CENTER 45 EMPS, 10 VIS!', 'Distribution Center in Charlotte, NC', 'Distribution Center', 'Charlotte', 'NC', '28269', 'warehouse', '{}', 1078, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-30T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'AUTOMOTIVE LOCATION 35 EMPS 40 CUSTOMERS!', 'Automotive Location in Libertyville, IL', 'Automotive Location', 'Libertyville', 'IL', '60048', 'other', '{}', 1078, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 1EMP 10VIS!', 'Office in Cynthiana, KY', 'Office', 'Cynthiana', 'KY', '41031', 'office', '{}', 418, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 50 VIS!', 'Facility in Chicago, IL', 'Facility', 'Chicago', 'IL', '60622', 'other', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'GROWING MANUFACTURING 15-20 EMPS!', 'Manufacturing Facility in Memphis, TN', 'Manufacturing Facility', 'Memphis', 'TN', '38106', 'warehouse', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 19EMPS 30VIS!', 'Office in Shrewsbury, MA', 'Office', 'Shrewsbury', 'MA', '01545', 'office', '{}', 726, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 15 EMPS/ COFFEE SERVICE!', 'Office in Oshkosh, WI', 'Office', 'Oshkosh', 'WI', '54904', 'office', '{}', 418, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 180EMPS!', 'Office in Baltimore, MD', 'Office', 'Baltimore', 'MD', '21202', 'office', '{}', 1320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 40 EMPS 10+VIS!', 'Facility in Lester, PA', 'Facility', 'Lester', 'PA', '19029', 'other', '{}', 880, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING FACILITY 40 EMPS!', 'Manufacturing Facility in Raymond, WI', 'Manufacturing Facility', 'Raymond', 'WI', '53126', 'warehouse', '{}', 880, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'WAREHOUSE 10 EMPS, 10-20 VIS!', 'Warehouse in Tucker, GA', 'Warehouse', 'Tucker', 'GA', '30084', 'warehouse', '{}', 682, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 15-20 EMPS/COFFEE SERVICE!', 'Office in Brentwood, TN', 'Office', 'Brentwood', 'TN', '37027', 'office', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING 180RES 2EMPS!', 'Apartment Building in Marathon, FL', 'Apartment Building', 'Marathon', 'FL', '33050', 'apartment', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 6-30 EMPS!', 'Facility in Sun Prairie, WI', 'Facility', 'Sun Prairie', 'WI', '53590', 'other', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-29T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'INDOOR SPORTS FACILITY 3EMPS 50+VIS!', 'Sports Facility in Boca Raton, FL', 'Sports Facility', 'Boca Raton', 'FL', '33487', 'gym', '{}', 836, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'GROWING AUTOMOTIVE LOCATION !', 'Automotive Location in Fort Pierce, FL', 'Automotive Location', 'Fort Pierce', 'FL', '34945', 'other', '{}', 880, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 35+EMPS!', 'Office in Monterey, CA', 'Office', 'Monterey', 'CA', '93940', 'office', '{}', 594, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE COMPLEX 100 EMPS!', 'Office Complex in Grand Rapids, MI', 'Office Complex', 'Grand Rapids', 'MI', '49505', 'office', '{}', 924, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 2 EMPS 300+ VISITORS!', 'Facility in Salem, OR', 'Facility', 'Salem', 'OR', '97301', 'other', '{}', 1078, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 20+EMPS!', 'Facility in Bristol, CT', 'Facility', 'Bristol', 'CT', '06010', 'other', '{}', 682, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'HOTEL/MOTEL 6 EMPS 300 GUESTS! ( COFFEE VENDING)', 'Hotel / Motel in Orlando, FL', 'Hotel / Motel', 'Orlando', 'FL', '32819', 'hotel', '{}', 880, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'SENIOR LIVING FACILITY 6EMPS 101RES!', 'Assisted Living Facility in Pittsburgh, PA', 'Assisted Living Facility', 'Pittsburgh', 'PA', '15202', 'hospital', '{}', 924, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 20 EMPS 2 VISITORS!( COFFEE SERVICE)', 'Office in Lisle, IL', 'Office', 'Lisle', 'IL', '60532', 'office', '{}', 990, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 100EMPS 3 VIS!', 'Facility in Marshall, AR', 'Facility', 'Marshall', 'AR', '72650', 'other', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 12 EMPS 30 VIS (COFFEE SERVICE)', 'Facility in Spokane, WA', 'Facility', 'Spokane', 'WA', '99205', 'other', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '2 BUILDING PUBLIC FACILITY 200 EMPS, 75 VIS!', 'Facility in Winston-Salem, NC', 'Facility', 'Winston-Salem', 'NC', '27101', 'other', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 75 EMPS!', 'Office Complex in Las Cruces, NM', 'Office Complex', 'Las Cruces', 'NM', '88005', 'office', '{}', 770, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING 50 EMPS! ( HAS EQUIPMENT!)', 'Manufacturing Facility in Lewes, DE', 'Manufacturing Facility', 'Lewes', 'DE', '19958', 'warehouse', '{}', 770, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'PUBLIC FACILITY 25-50 VIS!', 'Facility in Toledo, OH', 'Facility', 'Toledo', 'OH', '43623', 'other', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 20 STUDENTS, 7 EMPS!', 'Office in Alexander City, AL', 'Office', 'Alexander City', 'AL', '35010', 'office', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APT 130 RES!', 'Apartment Building in Grand Rapids, MN', 'Apartment Building', 'Grand Rapids', 'MN', '55744', 'apartment', '{}', 770, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'UPDATE 4/28 SCHOOL 300 STUDENTS 40 EMPS!', 'School in Parachute, CO', 'School', 'Parachute', 'CO', '81635', 'school', '{}', 748, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'COMMUNITY CLUBHOUSE 463 RES!', 'Community Clubhouse in Bonita Springs, FL', 'Community Clubhouse', 'Bonita Springs', 'FL', '34135', 'other', '{}', 1078, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-28T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'AUTOMOTIVE LOCATION 14-25+EMPS! (GROWING)', 'Automotive Location in San Jose, CA', 'Automotive Location', 'San Jose', 'CA', '95122', 'other', '{}', 418, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'Facility 2 EMPS 50 CUSTOMERS!', 'Facility in Everett, WA', 'Facility', 'Everett', 'WA', '98201', 'other', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'SCHOOL 50 STAFF 400+ STUDENTS!', 'School in Milwaukee, WI', 'School', 'Milwaukee', 'WI', '53204', 'school', '{}', 1540, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 25 EMPS!', 'Facility in Murfreesboro, TN', 'Facility', 'Murfreesboro', 'TN', '37129', 'other', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'SCHOOL 100+EMPS!', 'School in Philadelphia, PA', 'School', 'Philadelphia', 'PA', '19146', 'school', '{}', 1320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'WAREHOUSE 15 EMPS!', 'Warehouse in Philadelphia, PA', 'Warehouse', 'Philadelphia', 'PA', '19120', 'warehouse', '{}', 418, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 75 EMPS!', 'Office in Rochester, NY', 'Office', 'Rochester', 'NY', '14623', 'office', '{}', 748, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APT. COMPLEX 150 RES!', 'Apartment Complex in Pine Ridge, FL', 'Apartment Complex', 'Pine Ridge', 'FL', NULL, 'apartment', '{}', 902, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'RETAIL 80 EMPS!', 'Retail Establishment in Davidsonville, MD', 'Retail Establishment', 'Davidsonville', 'MD', '21035', 'retail', '{}', 968, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING 70 EMPS !', 'Manufacturing Facility in Montgomeryville, PA', 'Manufacturing Facility', 'Montgomeryville', 'PA', '18936', 'warehouse', '{}', 1078, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING 6 EMPS BUT GROWING!', 'Manufacturing Facility in Hammond, LA', 'Manufacturing Facility', 'Hammond', 'LA', '70401', 'warehouse', '{}', 418, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-27T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'RETAIL ESTABLISHMENT 40EMPS!', 'Retail Establishment in Richmond Heights, MO', 'Retail Establishment', 'Richmond Heights', 'MO', '63117', 'retail', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT COMPLEX 4EMPS 180+RES!', 'Apartment Complex in Washington, PA', 'Apartment Complex', 'Washington', 'PA', '15301', 'apartment', '{}', 1078, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 8EMPS ( COFFEE SERVICE)', 'Office in Sioux Falls, SD', 'Office', 'Sioux Falls', 'SD', '57108', 'office', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING 400 RES 4 EMPS HAS EQUIPMENT!', 'Apartment Building in Bozeman, MT', 'Apartment Building', 'Bozeman', 'MT', '59718', 'apartment', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 55 EMPS!', 'Office in Fremont, CA', 'Office', 'Fremont', 'CA', '94538', 'office', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'PRODUCTION FACILITY 25 EMPS !', 'Production Facility in Loris, SC', 'Production Facility', 'Loris', 'SC', '29569', 'warehouse', '{}', 550, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'WAREHOUSE 300 EMPS!', 'Warehouse in Linden, NJ', 'Warehouse', 'Linden', 'NJ', '07036', 'warehouse', '{}', 2860, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 40 EMPS 5VIS!', 'Office in Wixom, MI', 'Office', 'Wixom', 'MI', '48393', 'office', '{}', 968, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 134 EMPS!', 'Office in Columbia, MO', 'Office', 'Columbia', 'MO', '65201', 'office', '{}', 1034, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'WAREHOUSE 12 EMPS GROWING TO 50!', 'Warehouse in Milford, MI', 'Warehouse', 'Milford', 'MI', '48381', 'warehouse', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 60 EMPS!', 'Office in Chicago, IL', 'Office', 'Chicago', 'IL', '60606', 'office', '{}', 1078, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 0-25 EMPS/COFFEE SERVICE!', 'Office in New York, NY', 'Office', 'New York', 'NY', '10011', 'office', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'HOTEL/MOTEL 8 EMPS 50+VIS!', 'Hotel / motel in Guernsey, WY', 'Hotel / motel', 'Guernsey', 'WY', '82214', 'hotel', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'TRANSPORTATION FACILITY 40+EMPS 10VIS!', 'Transportation Facility in Winter Garden, FL', 'Transportation Facility', 'Winter Garden', 'FL', '34787', 'other', '{}', 946, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'NURSING HOME 80EMPS!', 'Nursing Home in Topeka, KS', 'Nursing Home', 'Topeka', 'KS', '66615', 'hospital', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '6 BUILDING OFFICE COMPLEX OPPURTUNITY (600+EMPS)!', 'Office Complex in Denver, CO', 'Office Complex', 'Denver', 'CO', '80204', 'office', '{}', 2420, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 200 CUSTOMERS!', 'Facility in Denver, CO', 'Facility', 'Denver', 'CO', '80207', 'other', '{}', 2200, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 50 EMPS!', 'Office in Bee Cave, TX', 'Office', 'Bee Cave', 'TX', '78738', 'office', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-24T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING FACILITY 65EMPS!', 'Manufacturing Facility in Tualatin, OR', 'Manufacturing Facility', 'Tualatin', 'OR', NULL, 'warehouse', '{}', 968, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'PUBLIC FACILITY 200-250 VIS!', 'Facility in Baltimore, MD', 'Facility', 'Baltimore', 'MD', '21216', 'other', '{}', 1078, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MEDICAL FACILITY 34+EMPS 10+VIS!', 'Medical Facility in Tulsa, OK', 'Medical Facility', 'Tulsa', 'OK', '74116', 'hospital', '{}', 462, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 10 EMPS 40 VIS!', 'Facility in Charleston, WV', 'Facility', 'Charleston', 'WV', '25314', 'other', '{}', 462, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 130+EMPS!', 'Facility in Austin, TX', 'Facility', 'Austin', 'TX', '78704', 'other', '{}', 1540, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'ASSITED LIVING 20 EMPS 80 RES!', 'Assisted Living Facility in Greendale, WI', 'Assisted Living Facility', 'Greendale', 'WI', '53129', 'hospital', '{}', 968, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING 50EMPS 2VIS!', 'Manufacturing Facility in Clackamas, OR', 'Manufacturing Facility', 'Clackamas', 'OR', '97015', 'warehouse', '{}', 726, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING 60 EMPS!', 'Manufacturing Facility in Marlow, OK', 'Manufacturing Facility', 'Marlow', 'OK', '73055', 'warehouse', '{}', 594, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'HOTEL/MOTEL 100 EMPS!', 'Hotel / Motel in Montgomery, AL', 'Hotel / Motel', 'Montgomery', 'AL', '36104', 'hotel', '{}', 770, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'RETAIL ESTABLISHMENT 2 EMPS 100 CUSTOMERS!', 'Retail Establishment in Tulsa, OK', 'Retail Establishment', 'Tulsa', 'OK', '74136', 'retail', '{}', 484, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 20 EMPS 30 VISITORS!', 'Office in Kenansville, NC', 'Office', 'Kenansville', 'NC', '28349', 'office', '{}', 550, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'RETAIL 15 EMPS, 20 CUSTOMERS!', 'Retail Establishment in Greencastle, IN', 'Retail Establishment', 'Greencastle', 'IN', '46135', 'retail', '{}', 550, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING 15-30 EMPS!', 'Manufacturing Facility in Rainbow City, AL', 'Manufacturing Facility', 'Rainbow City', 'AL', '35906', 'warehouse', '{}', 550, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APT.COMPLEX 230 RES!', 'Apartment Complex in Corvallis, OR', 'Apartment Complex', 'Corvallis', 'OR', '97330', 'apartment', '{}', 748, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'UPDATE 5/1 FACILITY 4 EMPS 100 VISITORS!', 'Facility in Harrisonburg, VA', 'Facility', 'Harrisonburg', 'VA', '22802', 'other', '{}', 308, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'UPDATE 4/23 ASSISTED LIVING 220 RES 6 EMPS!', 'Assisted Living Facility in South Bend, IN', 'Assisted Living Facility', 'South Bend', 'IN', NULL, 'hospital', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-23T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 30+EMPS!', 'Office in Cleveland, OH', 'Office', 'Cleveland', 'OH', '44110', 'office', '{}', 550, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'ASSITED LIVING 50 EMPS 50 RES!', 'Assisted Living Facility in Sellersburg, IN', 'Assisted Living Facility', 'Sellersburg', 'IN', '47172', 'hospital', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'UPDATE 4/29/26- MANUFACTURING 10 EMPS!', 'Manufacturing Facility in Milwaukee, WI', 'Manufacturing Facility', 'Milwaukee', 'WI', '53223', 'warehouse', '{}', 418, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFATURING 30+EMPS! (GROWING)', 'Manufacturing Facility in Burlington, NC', 'Manufacturing Facility', 'Burlington', 'NC', '27215', 'warehouse', '{}', 506, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'WAREHOUSE 25 EMPS!', 'Warehouse in Richmond, VA', 'Warehouse', 'Richmond', 'VA', '23230', 'warehouse', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 20+ EMPS, 100 VIS!', 'Facility in Kalispell, MT', 'Facility', 'Kalispell', 'MT', '59901', 'other', '{}', 572, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING 50EMPS 10VIS!', 'Manufacturing Facility in Brighton, CO', 'Manufacturing Facility', 'Brighton', 'CO', '80603', 'warehouse', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT COMPLEX 20EMPS 850+RES!', 'Apartment Complex in Lakeland, FL', 'Apartment Complex', 'Lakeland', 'FL', '33809', 'apartment', '{}', 1760, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT COMPLEX 3 EMPS 150 RESIDENTS!', 'Apartment Complex in Charlotte, NC', 'Apartment Complex', 'Charlotte', 'NC', '28262', 'apartment', '{}', 968, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, '3 BUILDING MEDICAL 80 EMPS, 80 VIS PER BUILDING!', 'Medical Facility in Abilene, TX', 'Medical Facility', 'Abilene', 'TX', '79602', 'hospital', '{}', 1320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 12 EMPS 5 DRIVERS!', 'Facility in Evansville, IN', 'Facility', 'Evansville', 'IN', '47720', 'other', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'HOTEL/MOTEL 100 EMPS 250 EMPS!', 'Hotel / Motel in Savannah, GA', 'Hotel / Motel', 'Savannah', 'GA', '31401', 'hotel', '{}', 1320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'SCHOOL 40 EMPS!', 'School in Danville, VA', 'School', 'Danville', 'VA', '24541', 'school', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'WAREHOUSE 30 EMPS!', 'Warehouse in Kentwood, MI', 'Warehouse', 'Kentwood', 'MI', '49512', 'warehouse', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING 50+ EMPS!', 'Manufacturing Facility in Horsham, PA', 'Manufacturing Facility', 'Horsham', 'PA', '19044', 'warehouse', '{}', 836, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 50EMPS!', 'Office in Bothell, WA', 'Office', 'Bothell', 'WA', '98011', 'office', '{}', 638, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-22T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'SCHOOL 45+EMPS!', 'School in Milford, NH', 'School', 'Milford', 'NH', '03055', 'school', '{}', 748, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APT 90+ RES!(COFFEE SERVICE)', 'Apartment Building in Wyomissing, PA', 'Apartment Building', 'Wyomissing', 'PA', '19610', 'apartment', '{}', 418, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'RETAIL 100-200 CUSTOMERS/ COFFEE SERVICE!', 'Retail Establishment in Dayton, OH', 'Retail Establishment', 'Dayton', 'OH', '45403', 'retail', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'CAR DEALER 96 EMPS 50 CUSTOMERS!', 'Car Dealer in Charleston, WV', 'Car Dealer', 'Charleston', 'WV', '25387', 'other', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING 30 EMPS!', 'Manufacturing Facility in Decatur, IL', 'Manufacturing Facility', 'Decatur', 'IL', '62526', 'warehouse', '{}', 594, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 40EMPS!', 'Facility in Moncks Corner, SC', 'Facility', 'Moncks Corner', 'SC', '29461', 'other', '{}', 704, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'COMMUNITY CLUBHOUSE 1000+ RES!', 'Community Clubhouse in Davenport, FL', 'Community Clubhouse', 'Davenport', 'FL', '33896', 'other', '{}', 1760, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'DISTRIBUTION CENTER 20EMPS 3VIS!', 'Distribution Center in Hebron, OH', 'Distribution Center', 'Hebron', 'OH', '43025', 'warehouse', '{}', 594, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'FACILITY 2 LOCATIONS!', 'Facility in Dubuque, IA', 'Facility', 'Dubuque', 'IA', '52003', 'other', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'PRODUCTION 80 EMPS!', 'Production Facility in Bay St. Louis, MS', 'Production Facility', 'Bay St. Louis', 'MS', '39520', 'warehouse', '{}', 682, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING 300 EMPS!', 'Manufacturing Facility in Goodman, MO', 'Manufacturing Facility', 'Goodman', 'MO', '64843', 'warehouse', '{}', 1320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'CAR DEALER 54 EMPS 30 CUSTOMERS!', 'Car Dealer in Charleston, WV', 'Car Dealer', 'Charleston', 'WV', '25315', 'other', '{}', 704, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APT 300 RES!', 'Apartment Complex in Kingsville, TX', 'Apartment Complex', 'Kingsville', 'TX', '78363', 'apartment', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'AUTOMOTIVE LOCATION 15 EMPS 50 DRIVERS!', 'Automotive Location in Greensboro, NC', 'Automotive Location', 'Greensboro', 'NC', '27409', 'other', '{}', 1078, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'AUTOMOTIVE LOCATION 15 EMPS!', 'Automotive Location in Brooksville, FL', 'Automotive Location', 'Brooksville', 'FL', '34601', 'other', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING FACILITY 50 EMPS!', 'Manufacturing Facility in Birmingham, AL', 'Manufacturing Facility', 'Birmingham', 'AL', '35217', 'warehouse', '{}', 770, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APT COMPLEX 500 RES!', 'Apartment Complex in Sarasota, FL', 'Apartment Complex', 'Sarasota', 'FL', '34239', 'apartment', '{}', 968, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'TRANSPORTATION 35 EMPS, 125 DRIVERS!', 'Transportation Facility in Harrisburg, PA', 'Transportation Facility', 'Harrisburg', 'PA', '17104', 'other', '{}', 1320, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE/CHURCH 10EMPS 100VIS!', 'Office in Bronx, NY', 'Office', 'Bronx', 'NY', '10469', 'office', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'APARTMENT BUILDING 200 RESIDENTS 10 VISITORS!', 'Apartment Building in Cedar Rapids, IA', 'Apartment Building', 'Cedar Rapids', 'IA', '52404', 'apartment', '{}', 814, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'GYM 4 EMPS 200 VISITORS!', 'Gym in Mishawaka, IN', 'Gym', 'Mishawaka', 'IN', '46545', 'gym', '{}', 660, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'WAREHOUSE 10 EMPS 10 DRIVERS!', 'Warehouse in Florence, KY', 'Warehouse', 'Florence', 'KY', '41042', 'warehouse', '{}', 484, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-21T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 50 EMPS (COFFEE SERVICE)', 'Office in Tucson, AZ', 'Office', 'Tucson', 'AZ', '85741', 'office', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 60 EMPS!', 'Office in Milwaukee, WI', 'Office', 'Milwaukee', 'WI', '53212', 'office', '{}', 990, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'COMMUNITY CLUBHOUSE 900 RES!', 'Community Clubhouse in Holden Beach, NC', 'Community Clubhouse', 'Holden Beach', 'NC', '28462', 'other', '{}', 968, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE OPPORTUNITY 46 EMPS!', 'Office Complex in Portland, OR', 'Office Complex', 'Portland', 'OR', '97266', 'office', '{}', 968, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'ASSISTED LIVING FACILITY 50EMPS!', 'Assisted Living Facility in Moultrie, GA', 'Assisted Living Facility', 'Moultrie', 'GA', '31768', 'hospital', '{}', 770, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'HOTEL 400 EMPS!', 'Hotel / Motel in Big Sky, MT', 'Hotel / Motel', 'Big Sky', 'MT', '59716', 'hotel', '{}', 990, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'HOTEL 300 EMPS!', 'Hotel / motel in Charlotte, NC', 'Hotel / motel', 'Charlotte', 'NC', '28202', 'hotel', '{}', 968, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'RETAIL 200 CUSTOMERS, 7 EMPS!', 'Retail Establishment in Vancouver, WA', 'Retail Establishment', 'Vancouver', 'WA', '98663', 'retail', '{}', 1056, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MEDICAL FACILITY 10+EMPS!', 'Medical Facility in Leesville, LA', 'Medical Facility', 'Leesville', 'LA', '71446', 'hospital', '{}', 550, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'OFFICE 40 EMPS AND GROWING! ( COFFEE SERVICE)', 'Office in Scottsdale, AZ', 'Office', 'Scottsdale', 'AZ', '85258', 'office', '{}', 528, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'UPDATE 4/20 OFFICE 15 EMPS 150 VIS!', 'Office in Elizabethtown, KY', 'Office', 'Elizabethtown', 'KY', '42701', 'office', '{}', 858, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T12:00:00Z', now(), 'Vending Connector');

  INSERT INTO vending_requests (created_by, title, description, location_name, city, state, zip, location_type, machine_types_wanted, price, status, contact_preference, is_public, lead_type, urgency, commission_offered, created_at, updated_at, seller_name)
  VALUES (admin_id, 'MANUFACTURING FACILITY 50 EMPS!', 'Manufacturing Facility in New York, NY', 'Manufacturing Facility', 'New York', 'NY', '10001', 'warehouse', '{}', 990, 'open', 'email', true, 'contracted', 'flexible', false, '2026-04-20T12:00:00Z', now(), 'Vending Connector');

END $$;
