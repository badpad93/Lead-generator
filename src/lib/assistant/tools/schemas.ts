import { z } from "zod";
import { BUSINESS_PLAN_JSON_SCHEMAS, BUSINESS_PLAN_TOOL_DESCRIPTIONS, BUSINESS_PLAN_TOOL_NAMES, BUSINESS_PLAN_ZOD_SCHEMAS } from "./businessPlanSchemas";

/**
 * Tool input contracts.
 *
 * Two representations are kept deliberately in sync and tested against
 * each other:
 *   1. `JSON_SCHEMAS` — hand-written strict JSON Schema sent to OpenAI
 *      (strict:true requires every property listed in `required`,
 *      `additionalProperties:false` at every object level, and nullable
 *      unions for optional inputs).
 *   2. Zod schemas — re-validate the model's arguments on the server
 *      before any tool runs, regardless of what OpenAI accepted.
 *
 * No schema accepts a price, discount, tax, shipping, total, margin,
 * commission, eligibility, payment-status, role, tenant, or ownership
 * value. Identity comes from the session, never from the model.
 */
export const READ_ONLY_TOOL_NAMES = [
  "search_catalog",
  "get_product_details",
  "compare_products",
  "get_customer_context",
  "get_order_status",
] as const;
/** Quote tools: get_quote is read-only; update_quote mutates the customer's own draft. */
export const QUOTE_TOOL_NAMES = ["get_quote", "update_quote"] as const;
/** Vending business-plan tools (deterministic calculations, saved plans, plan → quote, exports, financing hand-off). */
export { BUSINESS_PLAN_TOOL_NAMES };
export const TOOL_NAMES = [...READ_ONLY_TOOL_NAMES, ...QUOTE_TOOL_NAMES, ...BUSINESS_PLAN_TOOL_NAMES] as const;
export type ToolName = (typeof TOOL_NAMES)[number];
/** Tools that write; offered to the model only while assistant.write_tools_enabled is on. */
export const WRITE_TOOL_NAMES: ReadonlySet<ToolName> = new Set<ToolName>(["update_quote", "start_vending_business_plan", "update_vending_business_plan", "create_quote_from_business_plan", "start_financing_application"]);

export const CATALOG_KINDS = ["coffee", "machine", "location_service", "commerce"] as const;
export const SEARCH_LIMIT_MAX = 12;
const UUID_OR_SLUG = /^([0-9a-f-]{36}|[a-z][a-z0-9-]{2,63})$/i;

const kindSchema = z.enum(CATALOG_KINDS);
const productId = z.string().regex(UUID_OR_SLUG, "product_id must be a UUID or a known offering id");

export const searchCatalogInput = z
  .object({
    kind: kindSchema,
    query: z.string().max(120).nullable(),
    category_slug: z.string().max(60).regex(/^[a-z0-9-]*$/i).nullable(),
    limit: z.number().int().min(1).max(SEARCH_LIMIT_MAX),
  })
  .strict();

export const getProductDetailsInput = z
  .object({
    kind: kindSchema,
    product_id: productId,
  })
  .strict();

export const compareProductsInput = z
  .object({
    kind: kindSchema,
    product_ids: z.array(productId).min(2).max(4),
  })
  .strict();

export const getCustomerContextInput = z.object({}).strict();

export const getOrderStatusInput = z
  .object({
    order_id: z.string().uuid().nullable(),
    order_number: z.string().max(40).regex(/^[A-Za-z0-9-]*$/).nullable(),
  })
  .strict()
  .refine((v) => (v.order_id === null) !== (v.order_number === null), {
    message: "Provide exactly one of order_id or order_number",
  });

export const QUOTE_OPERATIONS = ["add", "remove", "set_quantity"] as const;
const CATALOG_REF = /^([0-9a-f-]{36}|[a-z0-9]+(-[a-z0-9]+)*)$/i;

export const getQuoteInput = z.object({}).strict();

/**
 * update_quote accepts ONLY catalog refs, an operation, and a quantity.
 * There is no field for a price, total, customer, email, QuickBooks id,
 * agreement status, eligibility, or URL — `strict()` rejects any extra key.
 */
export const updateQuoteInput = z
  .object({
    operations: z
      .array(
        z
          .object({
            op: z.enum(QUOTE_OPERATIONS),
            ref: z.string().min(3).max(64).regex(CATALOG_REF, "ref must be a catalog key, catalog id, or coffee product id"),
            quantity: z.number().int().min(1).max(999).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();

export const ZOD_SCHEMAS = {
  search_catalog: searchCatalogInput,
  get_product_details: getProductDetailsInput,
  compare_products: compareProductsInput,
  get_customer_context: getCustomerContextInput,
  get_order_status: getOrderStatusInput,
  get_quote: getQuoteInput,
  update_quote: updateQuoteInput,
  ...BUSINESS_PLAN_ZOD_SCHEMAS,
} as const;

export type SearchCatalogInput = z.infer<typeof searchCatalogInput>;
export type GetProductDetailsInput = z.infer<typeof getProductDetailsInput>;
export type CompareProductsInput = z.infer<typeof compareProductsInput>;
export type GetOrderStatusInput = z.infer<typeof getOrderStatusInput>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteInput>;

/** JSON Schema object as accepted by the Responses API `parameters`. */
export type JsonSchemaObject = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

const KIND_PROP = { type: "string", enum: [...CATALOG_KINDS], description: "Catalog to search: coffee (supplies and brewers with the visitor's price), machine (marketplace listings), location_service (informational fee ladder), commerce (equipment, services, deposits, and financing options with their checkout rules)." };

export const JSON_SCHEMAS: Record<ToolName, JsonSchemaObject> = {
  search_catalog: {
    type: "object",
    properties: {
      kind: KIND_PROP,
      query: { type: ["string", "null"], description: "Free-text search words, or null to browse. Words are matched against item names, descriptions, and categories; if nothing matches, the catalog is browsed instead." },
      category_slug: { type: ["string", "null"], description: "Optional category hint (coffee category slug such as coffee-beans, or a machine type such as combo). Prefer null and put category words in query; an unrecognised hint is ignored." },
      limit: { type: "integer", minimum: 1, maximum: SEARCH_LIMIT_MAX, description: "Maximum items to return." },
    },
    required: ["kind", "query", "category_slug", "limit"],
    additionalProperties: false,
  },
  get_product_details: {
    type: "object",
    properties: {
      kind: KIND_PROP,
      product_id: { type: "string", description: "The product_id returned by search_catalog." },
    },
    required: ["kind", "product_id"],
    additionalProperties: false,
  },
  compare_products: {
    type: "object",
    properties: {
      kind: KIND_PROP,
      product_ids: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 4,
        description: "Two to four product_ids of the same kind.",
      },
    },
    required: ["kind", "product_ids"],
    additionalProperties: false,
  },
  get_customer_context: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  get_order_status: {
    type: "object",
    properties: {
      order_id: { type: ["string", "null"], description: "Record UUID, or null when using order_number." },
      order_number: { type: ["string", "null"], description: "Public order or workflow number, or null when using order_id." },
    },
    required: ["order_id", "order_number"],
    additionalProperties: false,
  },
  get_quote: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  update_quote: {
    type: "object",
    properties: {
      operations: {
        type: "array",
        minItems: 1,
        maxItems: 10,
        description: "Ordered edits to the customer's draft quote. Refs are catalog keys (e.g. vendera-ai-cooler), catalog ids, or coffee product ids from search_catalog.",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: [...QUOTE_OPERATIONS], description: "add increments (or creates) a line; set_quantity replaces the quantity; remove deletes the line." },
            ref: { type: "string", description: "catalog_key, catalog product_id, or coffee product_id." },
            quantity: { type: ["integer", "null"], minimum: 1, maximum: 999, description: "Whole units (1-999); null for remove." },
          },
          required: ["op", "ref", "quantity"],
          additionalProperties: false,
        },
      },
    },
    required: ["operations"],
    additionalProperties: false,
  },
  ...BUSINESS_PLAN_JSON_SCHEMAS,
};

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  search_catalog:
    "Search the Vending Connector catalog (coffee products, machines for sale, location-service offerings, or the commerce catalog of equipment, services, deposits, and financing options). Returns public items with the final price the current visitor would see, or null when there is no catalog charge or pricing requires qualification. Each commerce item carries an `action` and `notices` that state what the customer may do; never promise anything the notices rule out.",
  get_product_details:
    "Get the full public details for one catalog item by product_id and kind.",
  compare_products:
    "Compare two to four catalog items of the same kind side by side using only their public attributes.",
  get_customer_context:
    "Get a minimal, privacy-safe summary of the signed-in customer (or authenticated:false for guests). Contains no contact, payment, or internal data.",
  get_order_status:
    "Look up the status of the signed-in customer's own coffee order, fulfillment workflow, or storefront quote by id or public number. Returns not_found for anything the customer does not own.",
  get_quote:
    "Show the signed-in customer's current Vinnie quote: lines, quantities, server-priced unit prices and totals (pre-tax), required freight, notices, expiry, financing interest, and whether checkout is currently available and why not. Guests get a sign-in notice.",
  update_quote:
    "Add, remove, or change the quantity of items on the signed-in customer's draft quote using catalog refs only. Prices, freight, and totals are computed by the server and returned; you cannot set them. Financing options cannot be added as lines — tell the customer to use the Start financing application button instead.",
  ...BUSINESS_PLAN_TOOL_DESCRIPTIONS,
};
