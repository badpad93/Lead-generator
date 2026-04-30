export function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_.*,()]/g, "").trim().slice(0, 200);
}
