"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";

interface Invitation {
  id: string;
  token: string;
  email: string | null;
  display_name: string | null;
  target_role: string;
  expires_at: string;
  revoked_at: string | null;
  accepted_at: string | null;
  created_at: string;
}

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch("/api/storefront/tenant/invitations", {
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
    if (res.ok) {
      const body = (await res.json()) as { invitations: Invitation[] };
      setInvitations(body.invitations);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/storefront/tenant/invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          email: email || null,
          display_name: displayName || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEmail("");
      setDisplayName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this invitation?")) return;
    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    await fetch(`/api/storefront/tenant/invitations?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
    await load();
  }

  const [resending, setResending] = useState<string | null>(null);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  // Re-email the SAME invite link to the address on the invitation.
  // Server refuses accepted/revoked/expired invites with a clear
  // reason so a stale link is never re-sent.
  async function resend(id: string) {
    setResending(id);
    setResendMsg(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/storefront/tenant/invitations/resend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ id }),
      });
      const body = (await res.json().catch(() => ({}))) as { sent_to?: string; error?: string };
      setResendMsg(res.ok ? `Invite re-sent to ${body.sent_to}` : body.error || "Resend failed");
    } catch {
      setResendMsg("Resend failed");
    } finally {
      setResending(null);
      setTimeout(() => setResendMsg(null), 5000);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="max-w-4xl mx-auto p-8">
      <Link href="/coffee/storefront" className="text-sm text-gray-500">
        ← Storefront
      </Link>
      <h1 className="text-2xl font-semibold mt-1">Invitations</h1>
      {resendMsg ? (
        <div className="mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {resendMsg}
        </div>
      ) : null}

      <form onSubmit={issue} className="mt-6 border rounded p-4 bg-gray-50 flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs text-gray-600">Email (optional)</label>
          <input
            type="email"
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-600">Display name (optional)</label>
          <input
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Acme Warehouse"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
        >
          {creating ? "Creating…" : "Issue link"}
        </button>
      </form>
      {error ? <div className="mt-3 text-sm text-red-700">{error}</div> : null}

      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-xs text-gray-500 uppercase">
          <tr>
            <th className="py-2">Email</th>
            <th className="py-2">Link</th>
            <th className="py-2">Status</th>
            <th className="py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={4} className="py-4 text-gray-500">
                Loading…
              </td>
            </tr>
          ) : invitations.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-4 text-gray-500">
                No invitations yet.
              </td>
            </tr>
          ) : (
            invitations.map((inv) => {
              const url = `${origin}/coffee/invite/${inv.token}`;
              const status = inv.accepted_at
                ? "accepted"
                : inv.revoked_at
                  ? "revoked"
                  : new Date(inv.expires_at) < new Date()
                    ? "expired"
                    : "active";
              return (
                <tr key={inv.id} className="border-t">
                  <td className="py-2">{inv.email ?? "—"}</td>
                  <td className="py-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(url)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Copy link
                    </button>
                  </td>
                  <td className="py-2">
                    <span
                      className={
                        status === "active"
                          ? "text-green-700"
                          : status === "accepted"
                            ? "text-gray-600"
                            : "text-red-700"
                      }
                    >
                      {status}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {status === "active" ? (
                      <span className="inline-flex items-center gap-3">
                        {inv.email ? (
                          <button
                            onClick={() => resend(inv.id)}
                            disabled={resending === inv.id}
                            className="text-xs text-green-700 hover:underline disabled:opacity-50 cursor-pointer"
                          >
                            {resending === inv.id ? "Sending…" : "Resend email"}
                          </button>
                        ) : null}
                        <button
                          onClick={() => revoke(inv.id)}
                          className="text-xs text-red-700 hover:underline cursor-pointer"
                        >
                          Revoke
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
