import { PUBLIC_MACHINE_LISTING_COLUMNS } from "@/lib/machineListings/publicShape";

/**
 * machine_listings columns that exist in the DEPLOYED schema.
 *
 * Source of truth is the migration set that has actually been applied,
 * not the public allowlist: migration 150 declares `sku`, `msrp_cents`,
 * `lead_time_days`, and eleven more manufacturer columns, but the live
 * database reports `column machine_listings.sku does not exist`, so an
 * explicit select that names any of them fails the whole read. The
 * public GET endpoints use `select *` and never notice; the assistant's
 * explicit select must only name columns proven to exist.
 *
 * Every column below is traced to the migration that adds it. Add a
 * column here only after confirming it exists in the deployed schema.
 */
export const MACHINE_LISTING_DEPLOYED_COLUMNS = [
  // 025_machine_listings.sql
  "id",
  "created_by",
  "title",
  "description",
  "city",
  "state",
  "machine_make",
  "machine_model",
  "machine_year",
  "machine_type",
  "condition",
  "quantity",
  "asking_price",
  "includes_card_reader",
  "includes_install",
  "includes_delivery",
  "photos",
  "contact_email",
  "contact_phone",
  "status",
  "admin_notes",
  "created_at",
  "updated_at",
  // 027_machine_listings_image_versions.sql
  "image_thumb_url",
  "image_medium_url",
  "image_main_url",
  // 055_machine_buy_now.sql
  "buy_now_enabled",
  "buy_now_price",
  // 057_machine_delivery_fee.sql
  "delivery_fee_cents",
  // 149_manufacturer_partners.sql
  "manufacturer_partner_id",
  "wholesale_price_cents",
] as const;

const DEPLOYED = new Set<string>(MACHINE_LISTING_DEPLOYED_COLUMNS);
const PUBLIC = new Set<string>(PUBLIC_MACHINE_LISTING_COLUMNS);

/**
 * The assistant's explicit select: only columns that are BOTH on the
 * public allowlist AND present in the deployed schema, and that the
 * assistant actually reads. `sku` is deliberately absent and is never
 * synthesized from the model, id, or any other field.
 */
export const ASSISTANT_MACHINE_SELECT_COLUMNS = [
  "id",
  "created_at",
  "status",
  "title",
  "description",
  "machine_make",
  "machine_model",
  "machine_year",
  "machine_type",
  "condition",
  "quantity",
  "city",
  "state",
  "asking_price",
  "buy_now_enabled",
  "buy_now_price",
  "delivery_fee_cents",
  "includes_card_reader",
  "includes_install",
  "includes_delivery",
  "photos",
  "image_thumb_url",
  "image_medium_url",
  "image_main_url",
] as const;

for (const c of ASSISTANT_MACHINE_SELECT_COLUMNS) {
  if (!PUBLIC.has(c)) throw new Error(`assistant machine select names a non-public column: ${c}`);
  if (!DEPLOYED.has(c)) throw new Error(`assistant machine select names a column missing from the deployed schema: ${c}`);
}

export const ASSISTANT_MACHINE_SELECT = ASSISTANT_MACHINE_SELECT_COLUMNS.join(", ");
