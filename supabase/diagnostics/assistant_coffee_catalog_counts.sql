-- ==========================================================
-- Assistant catalog diagnostic — READ-ONLY, COUNTS ONLY
-- ==========================================================
-- Run ONLY on the preview branch (ref eoaypmnwvyjltzzsgjcm).
-- Never run on production (ref tioqbgfvntwohkotrcyk).
-- Every statement is a SELECT that returns counts or schema metadata.
-- No names, descriptions, prices, contacts, or row contents are selected.
--
-- Read the funnel top to bottom: the first stage whose count is zero is
-- where the assistant's coffee search loses its rows.

-- 0. Sanity: which assistant tables/columns exist here (metadata only).
SELECT table_name, count(*) AS column_count
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('coffee_products','coffee_categories','coffee_product_categories',
                      'coffee_pricing_tiers','coffee_product_tier_prices',
                      'storefront_tenant_hidden_products','machine_listings',
                      'assistant_threads','assistant_messages','assistant_tool_runs')
 GROUP BY table_name ORDER BY table_name;

-- 1. Product selection: total vs active (the assistant reads active = true only).
SELECT
  count(*)                                         AS products_total,
  count(*) FILTER (WHERE active IS TRUE)           AS products_active,
  count(*) FILTER (WHERE active IS NOT TRUE)       AS products_inactive_or_null
FROM public.coffee_products;

-- 2. Availability / stock among active products (assistant shows all three; none are filtered out).
SELECT coalesce(stock_status, '(null)') AS stock_status, count(*) AS n
  FROM public.coffee_products
 WHERE active IS TRUE
 GROUP BY 1 ORDER BY 1;

-- 3. Category relationships among active products.
SELECT
  count(*) FILTER (WHERE p.category_id IS NULL)                                       AS active_without_primary_category,
  count(*) FILTER (WHERE p.category_id IS NOT NULL)                                   AS active_with_primary_category,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.coffee_product_categories l
                                  WHERE l.product_id = p.id))                         AS active_with_m2m_link,
  count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.coffee_product_categories l
                                      WHERE l.product_id = p.id))                     AS active_without_m2m_link
FROM public.coffee_products p
WHERE p.active IS TRUE;

-- 4. Categories: how many exist, how many have at least one active product (by slug shape only, no names).
SELECT
  (SELECT count(*) FROM public.coffee_categories)                                                      AS categories_total,
  (SELECT count(DISTINCT c.id) FROM public.coffee_categories c
     JOIN public.coffee_products p ON p.category_id = c.id AND p.active IS TRUE)                       AS categories_with_active_primary_product,
  (SELECT count(DISTINCT l.category_id) FROM public.coffee_product_categories l
     JOIN public.coffee_products p ON p.id = l.product_id AND p.active IS TRUE)                        AS categories_with_active_m2m_product,
  (SELECT count(*) FROM public.coffee_categories WHERE slug ILIKE '%coffee%')                          AS categories_with_coffee_in_slug;

-- 5. Guest pricing path (resolveCoffeeProductsPricing): tier_1 must exist and be active,
--    and each active product needs a tier_1 price row or a base price.
SELECT
  (SELECT count(*) FROM public.coffee_pricing_tiers WHERE tier_key = 'tier_1')                         AS tier_1_rows,
  (SELECT count(*) FROM public.coffee_pricing_tiers WHERE tier_key = 'tier_1' AND is_active)           AS tier_1_active_rows,
  (SELECT count(*) FROM public.coffee_products p WHERE p.active IS TRUE
     AND EXISTS (SELECT 1 FROM public.coffee_product_tier_prices tp
                   JOIN public.coffee_pricing_tiers t ON t.id = tp.pricing_tier_id
                  WHERE tp.product_id = p.id AND tp.is_active AND t.tier_key = 'tier_1'))              AS active_with_tier_1_price,
  (SELECT count(*) FROM public.coffee_products p WHERE p.active IS TRUE
     AND NOT EXISTS (SELECT 1 FROM public.coffee_product_tier_prices tp WHERE tp.product_id = p.id))   AS active_with_no_tier_price_rows,
  (SELECT count(*) FROM public.coffee_products p WHERE p.active IS TRUE AND (p.price IS NULL OR p.price <= 0)) AS active_with_no_base_price;

-- 6. Storefront visibility: tenant-hidden rows (guests are never filtered by this).
SELECT count(*) AS hidden_rows_total, count(DISTINCT tenant_id) AS tenants_with_hidden_rows
  FROM public.storefront_tenant_hidden_products;

-- 7. Machine catalog: status distribution and whether migration-150 columns exist (metadata only).
SELECT status, count(*) AS n FROM public.machine_listings GROUP BY status ORDER BY status;

SELECT column_name,
       (column_name IN ('sku','msrp_cents','lead_time_days','listing_warranty_summary','spec_sheet_url',
                        'brochure_url','video_url','dimensions_text','weight_lbs','electrical_requirements',
                        'temperature_zone','payment_system_compatibility','software_compatibility',
                        'certifications','manufacturer_shipping_notes')) AS from_migration_150
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'machine_listings'
 ORDER BY from_migration_150 DESC, column_name;

-- 8. What the assistant actually asked for (aggregates only; sanitized_input contents are not selected).
SELECT tool_name,
       status,
       coalesce(sanitized_input->>'kind', '(n/a)')                              AS kind,
       (sanitized_input->>'query') IS NOT NULL                                  AS had_query,
       (sanitized_input->>'category_slug') IS NOT NULL                          AS had_category,
       coalesce(error_code, '(none)')                                           AS error_code,
       count(*)                                                                 AS n
  FROM public.assistant_tool_runs
 GROUP BY 1,2,3,4,5,6
 ORDER BY 1,2,3;
