/** Normalize domain for dedup comparison. */
export function normalizeDomain(url: string): string {
  if (!url) return "";
  return url
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/.*$/, "")
    .trim();
}

/** Normalize phone to digits only. */
export function normalizePhone(phone: string): string {
  if (!phone) return "";
  return phone.replace(/[^0-9]/g, "");
}

/** Normalize business name for comparison. */
export function normalizeName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Build a dedupe key from lead fields. */
export function dedupeKey(lead: {
  business_name: string;
  website?: string;
  phone?: string;
  zip?: string;
}): string {
  const parts = [
    normalizeName(lead.business_name),
    normalizeDomain(lead.website ?? ""),
    normalizePhone(lead.phone ?? ""),
    (lead.zip ?? "").trim(),
  ];
  return parts.join("|");
}
