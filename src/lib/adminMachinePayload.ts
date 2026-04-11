/**
 * Shared validation + normalization for admin machine create/update.
 * Extracted from the route handlers so both POST (create) and
 * PATCH (update) can share the same logic without importing each other.
 */

export interface MachineInput {
  slug?: string;
  name?: string;
  model?: string | null;
  short_description?: string | null;
  description?: string | null;
  image_url?: string | null;
  price_cents?: number;
  finance_estimate_monthly_cents?: number | null;
  finance_term_years?: number;
  finance_rate_label?: string | null;
  machine_type?: string | null;
  features?: string[] | string;
  active?: boolean;
  sort_order?: number;
}

function str(v: unknown, max = 1000): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function int(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function bool(v: unknown, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  return v === true || v === "true";
}

function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseFeatures(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof v === "string") {
    return v
      .split(/\r?\n/)
      .map((l) => l.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

export function buildMachinePayload(
  body: MachineInput,
  { isCreate }: { isCreate: boolean }
): { payload?: Record<string, unknown>; error?: string } {
  const payload: Record<string, unknown> = {};

  if (isCreate) {
    const name = str(body.name, 200);
    if (!name) return { error: "Name is required" };
    payload.name = name;

    const slugRaw = str(body.slug, 80);
    const slug = slugRaw ? normalizeSlug(slugRaw) : normalizeSlug(name);
    if (!slug) return { error: "Could not derive a valid slug" };
    payload.slug = slug;

    const priceCents = int(body.price_cents);
    if (priceCents == null || priceCents < 0) {
      return { error: "price_cents must be a non-negative number" };
    }
    payload.price_cents = priceCents;
  } else {
    if (body.name !== undefined) {
      const name = str(body.name, 200);
      if (!name) return { error: "Name cannot be empty" };
      payload.name = name;
    }
    if (body.slug !== undefined) {
      const slug = normalizeSlug(str(body.slug, 80) || "");
      if (!slug) return { error: "Slug cannot be empty" };
      payload.slug = slug;
    }
    if (body.price_cents !== undefined) {
      const priceCents = int(body.price_cents);
      if (priceCents == null || priceCents < 0) {
        return { error: "price_cents must be a non-negative number" };
      }
      payload.price_cents = priceCents;
    }
  }

  if (body.model !== undefined) payload.model = str(body.model, 100);
  if (body.short_description !== undefined) {
    payload.short_description = str(body.short_description, 500);
  }
  if (body.description !== undefined) {
    payload.description = str(body.description, 5000);
  }
  if (body.image_url !== undefined) payload.image_url = str(body.image_url, 1000);
  if (body.machine_type !== undefined) {
    payload.machine_type = str(body.machine_type, 50);
  }

  if (body.finance_estimate_monthly_cents !== undefined) {
    const v = int(body.finance_estimate_monthly_cents);
    if (v != null && v < 0) {
      return { error: "finance_estimate_monthly_cents must be non-negative" };
    }
    payload.finance_estimate_monthly_cents = v;
  }
  if (body.finance_term_years !== undefined) {
    const v = int(body.finance_term_years);
    if (v == null || v <= 0 || v > 50) {
      return { error: "finance_term_years must be between 1 and 50" };
    }
    payload.finance_term_years = v;
  }
  if (body.finance_rate_label !== undefined) {
    payload.finance_rate_label = str(body.finance_rate_label, 100);
  }
  if (body.features !== undefined) {
    payload.features = parseFeatures(body.features);
  }
  if (body.active !== undefined) {
    payload.active = bool(body.active, true);
  }
  if (body.sort_order !== undefined) {
    const v = int(body.sort_order);
    if (v == null) return { error: "sort_order must be a number" };
    payload.sort_order = v;
  }

  return { payload };
}
