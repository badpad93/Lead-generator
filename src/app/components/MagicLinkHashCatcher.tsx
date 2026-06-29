"use client";

import { useEffect, useRef } from "react";
import { consumeAuthFlow } from "@/lib/auth";

/**
 * Catches a Supabase magic-link hash that landed on a non-callback route
 * (e.g. the homepage instead of /auth/callback). This happens when the
 * `redirect_to` URL passed to Supabase's verify endpoint isn't on the
 * project's Redirect URL allowlist — Supabase silently falls back to
 * the Site URL.
 *
 * Forwards the user to /auth/callback (preserving the hash) so the
 * existing flow logic runs.
 */
export default function MagicLinkHashCatcher() {
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    if (!hash.includes("access_token=")) return;
    if (window.location.pathname.startsWith("/auth/callback")) return;

    const flow = consumeAuthFlow();
    const params = new URLSearchParams();
    if (flow) params.set("flow", flow);

    const target = `/auth/callback${params.toString() ? `?${params.toString()}` : ""}${hash}`;
    window.location.replace(target);
  }, []);

  return null;
}
