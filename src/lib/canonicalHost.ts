/**
 * Canonical-host enforcement for the production deployment only.
 *
 * Vercel sets NODE_ENV=production on Preview builds too, so gating on
 * NODE_ENV redirected every preview URL to vendingconnector.com and made
 * previews untestable. VERCEL_ENV distinguishes the environments:
 * "production" | "preview" | "development", and it is unset outside
 * Vercel. Only the literal "production" enforces the canonical host.
 *
 * Dependency-free so it is safe inside the middleware bundle.
 */
export const CANONICAL_DOMAIN = "vendingconnector.com";

export type EnvLike = Record<string, string | undefined>;

export function isProductionDeployment(env: EnvLike = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

function isCanonicalOrLocalHost(host: string): boolean {
  return host === CANONICAL_DOMAIN || host === `www.${CANONICAL_DOMAIN}` || host.startsWith("localhost");
}

/**
 * Where a request must be redirected to enforce the canonical host, or
 * null when no redirect applies. The path and query string are kept;
 * the scheme becomes https and the port is dropped.
 */
export function canonicalRedirectTarget(requestUrl: string, host: string | null, env: EnvLike = process.env): URL | null {
  if (!isProductionDeployment(env)) return null;
  const h = (host ?? "").trim();
  if (!h || isCanonicalOrLocalHost(h)) return null;
  const url = new URL(requestUrl);
  url.hostname = CANONICAL_DOMAIN;
  url.port = "";
  url.protocol = "https:";
  return url;
}
