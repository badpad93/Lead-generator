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
