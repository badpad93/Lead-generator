import type { Profile } from "./types";
import { createBrowserClient } from "./supabase";

const SIGNUP_ROLE_KEY = "vc_signup_role";
const REDIRECT_KEY = "vc_redirect_after_login";
const FLOW_KEY = "vc_auth_flow";

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

/** Store the role selected during signup (before OAuth redirect) */
export function storeSignupRole(role: string): void {
  localStorage.setItem(SIGNUP_ROLE_KEY, role);
}

/** Retrieve and clear the stored signup role */
export function consumeSignupRole(): string | null {
  const role = localStorage.getItem(SIGNUP_ROLE_KEY);
  if (role) localStorage.removeItem(SIGNUP_ROLE_KEY);
  return role;
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
  // Verify the session is actually gone
  const { data: { session } } = await supabase.auth.getSession();
  return session === null;
}

/** Sign in with Google OAuth for LOGIN flow */
export async function signInWithGoogle(): Promise<void> {
  const supabase = createBrowserClient();
  storeAuthFlow("login");
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${getSiteUrl()}/auth/callback?flow=login`,
      skipBrowserRedirect: false,
      queryParams: {
        prompt: "select_account",
      },
    },
  });
}

/** Sign in with Google OAuth for SIGNUP flow (forces account selection) */
export async function signUpWithGoogle(): Promise<void> {
  const supabase = createBrowserClient();
  storeAuthFlow("signup");
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${getSiteUrl()}/auth/callback?flow=signup`,
      skipBrowserRedirect: false,
      queryParams: {
        prompt: "select_account",
      },
    },
  });
}

/** Sign in with Microsoft OAuth for LOGIN flow */
export async function signInWithMicrosoft(): Promise<void> {
  const supabase = createBrowserClient();
  storeAuthFlow("login");
  await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: `${getSiteUrl()}/auth/callback?flow=login`,
      skipBrowserRedirect: false,
      scopes: "email",
    },
  });
}

/** Sign in with Microsoft OAuth for SIGNUP flow */
export async function signUpWithMicrosoft(): Promise<void> {
  const supabase = createBrowserClient();
  storeAuthFlow("signup");
  await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: `${getSiteUrl()}/auth/callback?flow=signup`,
      skipBrowserRedirect: false,
      scopes: "email",
    },
  });
}

/** Sign out */
export async function signOut(): Promise<void> {
  const supabase = createBrowserClient();
  await supabase.auth.signOut();
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
