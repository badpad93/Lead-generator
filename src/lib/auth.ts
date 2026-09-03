import type { Profile } from "./types";
import { createBrowserClient } from "./supabase";

const SIGNUP_ROLE_KEY = "vc_signup_role";
const REDIRECT_KEY = "vc_redirect_after_login";
const FLOW_KEY = "vc_auth_flow";
const SIGNUP_LEAD_KEY = "vc_signup_lead";
const INVITE_TOKEN_KEY = "vc_storefront_invite_token";

/** Store where to redirect after login completes */
export function storeRedirectAfterLogin(path: string): void {
  localStorage.setItem(REDIRECT_KEY, path);
}

/** Retrieve and clear the stored redirect path */
export function consumeRedirectAfterLogin(): string | null {
  const path = localStorage.getItem(REDIRECT_KEY);
  if (path) localStorage.removeItem(REDIRECT_KEY);
  return path;
}

/** Store the role selected during signup (before OAuth redirect) — uses BOTH localStorage and cookie for resilience */
export function storeSignupRole(role: string): void {
  localStorage.setItem(SIGNUP_ROLE_KEY, role);
  document.cookie = `vc_signup_role=${encodeURIComponent(role)};path=/;max-age=600;SameSite=Lax`;
}

/** Retrieve and clear the stored signup role — checks cookie first (survives OAuth redirects better) */
export function consumeSignupRole(): string | null {
  // Try cookie first (more reliable across OAuth redirects)
  const cookieMatch = document.cookie.match(/(?:^|;\s*)vc_signup_role=([^;]*)/);
  const cookieRole = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
  // Also check localStorage
  const lsRole = localStorage.getItem(SIGNUP_ROLE_KEY);
  const role = cookieRole || lsRole;
  // Clean up both
  localStorage.removeItem(SIGNUP_ROLE_KEY);
  document.cookie = "vc_signup_role=;path=/;max-age=0";
  return role;
}

export interface SignupLeadData {
  business_name: string;
  contact_name: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  entity_type: string;
  immediate_need: string;
}

export function storeSignupLead(data: SignupLeadData): void {
  localStorage.setItem(SIGNUP_LEAD_KEY, JSON.stringify(data));
}

export function consumeSignupLead(): SignupLeadData | null {
  const raw = localStorage.getItem(SIGNUP_LEAD_KEY);
  if (raw) localStorage.removeItem(SIGNUP_LEAD_KEY);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

/**
 * Storefront invite token pass-through. When a signed-out visitor
 * clicks Accept on /coffee/invite/{token} the button routes them
 * to /signup?invite_token=..., which stashes the token here so it
 * survives the /check-email round-trip and the OAuth redirect.
 * The auth callback consumes it after the session lands and, if
 * the invitation is still valid, calls
 * /api/storefront/enrollment/consume then redirects to the
 * storefront — no second Accept click.
 *
 * Uses BOTH localStorage and a short-lived cookie (10 min) so the
 * value survives an OAuth redirect that could clear localStorage
 * on a different subdomain. Same pattern as storeSignupRole.
 */
export function storeInviteToken(token: string): void {
  if (!token) return;
  try { localStorage.setItem(INVITE_TOKEN_KEY, token); } catch {}
  document.cookie = `${INVITE_TOKEN_KEY}=${encodeURIComponent(token)};path=/;max-age=600;SameSite=Lax`;
}

export function consumeInviteToken(): string | null {
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|;\\s*)${INVITE_TOKEN_KEY}=([^;]*)`));
  const cookieVal = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
  let lsVal: string | null = null;
  try { lsVal = localStorage.getItem(INVITE_TOKEN_KEY); } catch {}
  const token = cookieVal || lsVal;
  try { localStorage.removeItem(INVITE_TOKEN_KEY); } catch {}
  document.cookie = `${INVITE_TOKEN_KEY}=;path=/;max-age=0`;
  return token;
}

/** Store the auth flow type so the callback can distinguish login vs signup */
export function storeAuthFlow(flow: "login" | "signup"): void {
  localStorage.setItem(FLOW_KEY, flow);
}

/** Retrieve and clear the stored auth flow type */
export function consumeAuthFlow(): "login" | "signup" | null {
  const flow = localStorage.getItem(FLOW_KEY) as "login" | "signup" | null;
  if (flow) localStorage.removeItem(FLOW_KEY);
  return flow;
}

/** Get the current Supabase session access token */
export async function getAccessToken(): Promise<string | null> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/** Get the base site URL (prefer env var, fall back to window.location.origin) */
function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "https://vendingconnector.com";
}

/**
 * Fully clear any existing Supabase session and verify it's gone.
 * Returns true if session is confirmed cleared.
 */
export async function ensureSignedOut(): Promise<boolean> {
  const supabase = createBrowserClient();
  await supabase.auth.signOut();
  // Belt-and-suspenders: purge EVERY Supabase auth artifact from
  // both stores. signOut() clears the current client's cookie set,
  // but stale sets from earlier client generations survive it —
  // legacy localStorage sessions (plain supabase-js era) and
  // cookie chunks written with different attributes (e.g. a
  // Domain=.vendingconnector.com set shadowing today's host-only
  // set). A stale shadow set means the SERVER keeps authenticating
  // as a previous account after the browser has switched users —
  // observed live as an admin cookie session shadowing a freshly
  // signed-in test customer.
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("sb-") || key === "supabase.auth.token") {
        localStorage.removeItem(key);
      }
    }
  } catch {}
  try {
    const host = window.location.hostname;
    const domains = [
      "", // host-only
      host,
      host.startsWith("www.") ? host.slice(4) : `.${host}`,
      `.${host.split(".").slice(-2).join(".")}`, // apex-wide (.vendingconnector.com)
    ];
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0]?.trim();
      if (!name || !name.startsWith("sb-")) continue;
      for (const domain of domains) {
        document.cookie = `${name}=;path=/;max-age=0${domain ? `;domain=${domain}` : ""}`;
      }
    }
  } catch {}
  const { data: { session } } = await supabase.auth.getSession();
  return session === null;
}

/** Sign in with Google OAuth for LOGIN flow */
export async function signInWithGoogle(): Promise<void> {
  const supabase = createBrowserClient();
  storeAuthFlow("login");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${getSiteUrl()}/auth/callback?flow=login`,
      skipBrowserRedirect: false,
      queryParams: {
        prompt: "select_account",
      },
    },
  });
  if (error) throw error;
}

/** Sign in with Google OAuth for SIGNUP flow (forces account selection) */
export async function signUpWithGoogle(role?: string): Promise<void> {
  const supabase = createBrowserClient();
  storeAuthFlow("signup");
  if (role) storeSignupRole(role);
  const redirectUrl = new URL(`${getSiteUrl()}/auth/callback`);
  redirectUrl.searchParams.set("flow", "signup");
  if (role) redirectUrl.searchParams.set("role", role);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl.toString(),
      skipBrowserRedirect: false,
      queryParams: {
        prompt: "select_account",
      },
    },
  });
  if (error) throw error;
}

/** Sign in with Microsoft OAuth for LOGIN flow */
export async function signInWithMicrosoft(): Promise<void> {
  const supabase = createBrowserClient();
  storeAuthFlow("login");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: `${getSiteUrl()}/auth/callback?flow=login`,
      skipBrowserRedirect: false,
      scopes: "email",
    },
  });
  if (error) throw error;
}

/** Sign in with Microsoft OAuth for SIGNUP flow */
export async function signUpWithMicrosoft(role?: string): Promise<void> {
  const supabase = createBrowserClient();
  storeAuthFlow("signup");
  if (role) storeSignupRole(role);
  const redirectUrl = new URL(`${getSiteUrl()}/auth/callback`);
  redirectUrl.searchParams.set("flow", "signup");
  if (role) redirectUrl.searchParams.set("role", role);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: redirectUrl.toString(),
      skipBrowserRedirect: false,
      scopes: "email",
    },
  });
  if (error) throw error;
}

/** Sign out */
export async function signOut(): Promise<void> {
  const supabase = createBrowserClient();
  await supabase.auth.signOut();
}

/** Sign in with Yahoo OAuth for LOGIN flow */
export function signInWithYahoo(): void {
  storeAuthFlow("login");
  window.location.href = "/api/auth/yahoo?flow=login";
}

/** Sign in with Yahoo OAuth for SIGNUP flow */
export function signUpWithYahoo(role?: string): void {
  storeAuthFlow("signup");
  if (role) storeSignupRole(role);
  const params = new URLSearchParams({ flow: "signup" });
  if (role) params.set("role", role);
  window.location.href = `/api/auth/yahoo?${params.toString()}`;
}

/** Fetch the current user's profile */
export async function fetchProfile(): Promise<Profile | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  return res.json();
}

/** Make an authenticated API request */
export async function apiRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(url, { ...options, headers });
}
