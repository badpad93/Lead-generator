import type { Profile } from "./types";
import { createBrowserClient } from "./supabase";

const SIGNUP_ROLE_KEY = "vendhub_signup_role";

/** Store the role selected during signup (before GitHub redirect) */
export function storeSignupRole(role: string): void {
  localStorage.setItem(SIGNUP_ROLE_KEY, role);
}

/** Retrieve and clear the stored signup role */
export function consumeSignupRole(): string | null {
  const role = localStorage.getItem(SIGNUP_ROLE_KEY);
  if (role) localStorage.removeItem(SIGNUP_ROLE_KEY);
  return role;
}

/** Get the current Supabase session access token */
export async function getAccessToken(): Promise<string | null> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/** Sign in with GitHub OAuth via Supabase */
export async function signInWithGitHub(): Promise<void> {
  const supabase = createBrowserClient();
  await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
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
