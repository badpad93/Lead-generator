-- Seed Apex AI Vending Flavia Product Catalog

INSERT INTO coffee_categories (name, slug, description, sort_order) VALUES
  ('Cold Beverages', 'cold-beverages', 'Cold brew, infused waters, and iced teas', 4)
ON CONFLICT (slug) DO NOTHING;

-- Coffee Packets
INSERT INTO coffee_products (category_id, name, sku, description, price, pack_quantity, unit, min_order_qty, active, sort_order) VALUES
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-packets'), 'Alterra Morning Roast', '48008', 'Flavia Alterra Morning Roast — pack of 100', 54.99, 100, 'pack', 1, true, 10),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-packets'), 'Alterra Donut Shop', '48019', 'Flavia Alterra Donut Shop — pack of 100', 54.99, 100, 'pack', 1, true, 11),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-packets'), 'Alterra Colombia', '48006', 'Flavia Alterra Colombia — pack of 100', 54.99, 100, 'pack', 1, true, 12),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-packets'), 'Alterra French Roast', '48010', 'Flavia Alterra French Roast — pack of 100', 54.99, 100, 'pack', 1, true, 13),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-packets'), 'Alterra French Vanilla', '48009', 'Flavia Alterra French Vanilla — pack of 100', 54.99, 100, 'pack', 1, true, 14),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-packets'), 'Alterra Hazelnut', '48722', 'Flavia Alterra Hazelnut — pack of 100', 54.99, 100, 'pack', 1, true, 15),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-packets'), 'Lavazza Caramel Latte', '48750', 'Flavia Lavazza Caramel Latte — pack of 76', 51.99, 76, 'pack', 1, true, 16),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-packets'), 'Lavazza Vanilla Latte', '48689', 'Flavia Lavazza Vanilla Latte — pack of 72', 64.99, 72, 'pack', 1, true, 17),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-packets'), 'Lavazza Tierra Organic', '99887', 'Flavia Lavazza Tierra Organic — pack of 76', 63.99, 76, 'pack', 1, true, 18),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-packets'), 'Lavazza Decaf', '48996547', 'Flavia Lavazza Decaf', 53.99, 1, 'pack', 1, true, 19),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-packets'), 'Starbucks Veranda', '48102', 'Flavia Starbucks Veranda — pack of 76', 68.99, 76, 'pack', 1, true, 20),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-packets'), 'Starbucks Pike Place', '48103', 'Flavia Starbucks Pike Place — pack of 76', 68.99, 76, 'pack', 1, true, 21),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-packets'), 'Starbucks Cafe Verona', '48104', 'Flavia Starbucks Cafe Verona — pack of 76', 68.99, 76, 'pack', 1, true, 22),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-packets'), 'Cocoa Bliss', '48788', 'Flavia Cocoa Bliss — pack of 72', 59.39, 72, 'pack', 1, true, 23),

-- Tea
  ((SELECT id FROM coffee_categories WHERE slug = 'tea'), 'Select Green Tea', '22145', 'Flavia Select Green — pack of 100', 54.99, 100, 'pack', 1, true, 10),
  ((SELECT id FROM coffee_categories WHERE slug = 'tea'), 'Peppermint Tea', '55874554', 'Flavia Peppermint — pack of 100', 54.99, 100, 'pack', 1, true, 11),
  ((SELECT id FROM coffee_categories WHERE slug = 'tea'), 'White Orange Tea', '20114', 'Flavia White Orange — pack of 100', 54.99, 100, 'pack', 1, true, 12),
  ((SELECT id FROM coffee_categories WHERE slug = 'tea'), 'Chai Tea', '55874', 'Flavia Chai — pack of 100', 54.99, 100, 'pack', 1, true, 13),
  ((SELECT id FROM coffee_categories WHERE slug = 'tea'), 'Lemon Tea', '986654', 'Flavia Lemon — pack of 100', 54.99, 100, 'pack', 1, true, 14),

-- Cold Beverages
  ((SELECT id FROM coffee_categories WHERE slug = 'cold-beverages'), 'Strawberry Water', '5214554', 'Flavia Strawberry Water — pack of 100', 59.99, 100, 'pack', 1, true, 10),
  ((SELECT id FROM coffee_categories WHERE slug = 'cold-beverages'), 'Cucumber Water', '54127896', 'Flavia Cucumber Water — pack of 100', 59.99, 100, 'pack', 1, true, 11),
  ((SELECT id FROM coffee_categories WHERE slug = 'cold-beverages'), 'Black Tea (Cold)', '8547898', 'Flavia Black Tea — pack of 100', 59.99, 100, 'pack', 1, true, 12),
  ((SELECT id FROM coffee_categories WHERE slug = 'cold-beverages'), 'Cinnamon Dolce', '885478', 'Flavia Cinnamon Dolce — pack of 80', 59.99, 80, 'pack', 1, true, 13),
  ((SELECT id FROM coffee_categories WHERE slug = 'cold-beverages'), 'Cold Brew', '2519837', 'Flavia Cold Brew — pack of 80', 69.99, 80, 'pack', 1, true, 14),

-- Equipment & Accessories (Coffee Brewers)
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-brewers'), 'Flavia C600 Brewer', 'C600', 'Flavia C600 commercial brewer (machine cost $0, ships for $39.99)', 0, 1, 'each', 1, true, 10),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-brewers'), 'Flavia C300 Brewer', '00112289', 'Flavia C300 brewer (machine cost $0, ships for $39.99)', 0, 1, 'each', 1, true, 11),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-brewers'), 'Aroma Brewer', '88745', 'Flavia Aroma Brewer', 99.99, 1, 'each', 1, true, 12),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-brewers'), 'C600 Chill Module', '555241', 'Chill module for Flavia C600', 499.99, 1, 'each', 1, true, 13),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-brewers'), 'C300 Chill Module', '2973554', 'Chill module for Flavia C300', 299.99, 1, 'each', 1, true, 14),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-brewers'), '16 Drawer Organizer', '368547', '16-drawer Flavia accessory organizer', 199.99, 1, 'each', 1, true, 15),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-brewers'), '12 Drawer Organizer', '258741', '12-drawer Flavia accessory organizer', 149.99, 1, 'each', 1, true, 16),
  ((SELECT id FROM coffee_categories WHERE slug = 'coffee-brewers'), 'Starter Kit', '111222544', 'Flavia complete starter kit', 2499.00, 1, 'kit', 1, true, 17),

-- Accessories — map to existing supply categories
  ((SELECT id FROM coffee_categories WHERE slug = 'lids'), 'Coffee Lids', '55424', 'Coffee cup lids', 59.99, 1, 'case', 1, true, 10),
  ((SELECT id FROM coffee_categories WHERE slug = 'cups'), '10 oz Cups', '100010', '10 oz disposable cups', 69.99, 1, 'case', 1, true, 10),
  ((SELECT id FROM coffee_categories WHERE slug = 'stirrers'), 'Stirrers', '45214', 'Stirrers', 14.99, 1, 'box', 1, true, 10),
  ((SELECT id FROM coffee_categories WHERE slug = 'sleeves'), 'Cup Sleeves', '887639', 'Cup sleeves', 84.99, 1, 'case', 1, true, 10)
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  pack_quantity = EXCLUDED.pack_quantity,
  unit = EXCLUDED.unit,
  category_id = EXCLUDED.category_id,
  active = true,
  updated_at = now();
