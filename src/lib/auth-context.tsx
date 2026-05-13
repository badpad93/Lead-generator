"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { Profile } from "@/lib/types";
import { createBrowserClient } from "@/lib/supabase";

interface AuthState {
  profile: Profile | null;
  token: string;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  sessionUser: { email: string; name: string } | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  profile: null,
  token: "",
  isLoading: true,
  isAuthenticated: false,
  isAdmin: false,
  sessionUser: null,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function extractSessionUser(session: { user?: { email?: string; user_metadata?: Record<string, unknown> } }) {
  const meta = session.user?.user_metadata || {};
  return {
    email: session.user?.email || "",
    name:
      (meta.full_name as string) ||
      (meta.name as string) ||
      ((meta.custom_claims as Record<string, string>)?.global_name) ||
      session.user?.email?.split("@")[0] ||
      "User",
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionUser, setSessionUser] = useState<{ email: string; name: string } | null>(null);
  const tokenRef = useRef("");

  useEffect(() => {
    const supabase = createBrowserClient();
    let mounted = true;

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (!session?.access_token) {
        setIsLoading(false);
        return;
      }

      setSessionUser(extractSessionUser(session));

      try {
        const [profileRes, adminRes] = await Promise.all([
          fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
          fetch("/api/admin/check", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
        ]);
        if (!mounted) return;

        if (profileRes.ok) {
          setProfile(await profileRes.json());
          setToken(session.access_token);
          tokenRef.current = session.access_token;
        } else if (profileRes.status === 401) {
          setSessionUser(null);
        }
        if (adminRes.ok) {
          const data = await adminRes.json();
          setIsAdmin(!!data.isAdmin);
        }
      } catch {
        // keep sessionUser on network error so Navbar still shows logged-in
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        if (event === "TOKEN_REFRESHED" && session?.access_token) {
          setToken(session.access_token);
          tokenRef.current = session.access_token;
        } else if (event === "SIGNED_OUT") {
          setProfile(null);
          setSessionUser(null);
          setToken("");
          tokenRef.current = "";
          setIsAdmin(false);
          setIsLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    setProfile(null);
    setSessionUser(null);
    setToken("");
    tokenRef.current = "";
    setIsAdmin(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        setProfile(await res.json());
      }
    } catch {
      // best-effort
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        profile,
        token,
        isLoading,
        isAuthenticated: !!sessionUser,
        isAdmin,
        sessionUser,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
