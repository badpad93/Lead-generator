"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase";

/**
 * Accept action for a public quote. Signed-in customer → accept assigns/keeps
 * the quoted tier and lands them on the storefront. Prospect → accept, then
 * into the operator-branded signup carrying the storefront + quote context.
 */
export default function QuoteAccept({
  token,
  slug,
  accent,
  primary,
  alreadyAccepted,
}: {
  token: string;
  slug: string | null;
  accent: string;
  primary: string;
  alreadyAccepted: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(alreadyAccepted);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/coffee/quote/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Could not accept the quote");
        setBusy(false);
        return;
      }
      const body = (await res.json()) as { tenant_slug?: string | null };
      const dest = body.tenant_slug ?? slug;
      if (session?.user) {
        window.location.href = dest ? `/coffee/o/${dest}` : "/coffee";
      } else {
        // Prospect: continue into the operator-branded signup, carrying the
        // storefront + quote so the quoted tier applies once enrolled.
        const params = new URLSearchParams();
        if (dest) params.set("storefront", dest);
        params.set("quote", token);
        window.location.href = `/signup?${params.toString()}`;
      }
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  if (done) {
    return <div className="mt-6 rounded-md px-4 py-3 text-sm" style={{ background: "#f0f7f0", color: "#166534" }}>Quote accepted. Thank you!</div>;
  }
  return (
    <div className="mt-6">
      <button
        onClick={accept}
        disabled={busy}
        className="rounded-md px-6 py-3 text-sm font-semibold disabled:opacity-60"
        style={{ background: accent, color: primary }}
      >
        {busy ? "Accepting…" : "Accept quote"}
      </button>
      {error ? <div className="mt-2 text-sm text-red-700">{error}</div> : null}
    </div>
  );
}
