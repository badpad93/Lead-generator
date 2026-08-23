"use client";

/**
 * /admin/marketing/gondola
 *
 * Admin-only uploader for the 5 marketing gondola images that render
 * on the public homepage and the logged-in dashboard. Each slot shows
 * the current image (with source label — Uploaded / Placeholder), a
 * "Choose file" input, and a Revert button that drops the override
 * so the shipped placeholder SVG takes over again.
 *
 * Access is gated server-side by the PUT/DELETE endpoints — this
 * page is a UI convenience; a non-admin who navigates here gets 403s
 * on every action they try.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createBrowserClient } from "@/lib/supabase";
import {
  GONDOLA_SLOTS,
  GONDOLA_SLOT_LABELS,
  GONDOLA_MAX_BYTES,
  type GondolaSlot,
} from "@/lib/marketingGondola";
import {
  ArrowLeft,
  ImageIcon,
  Loader2,
  RotateCcw,
  Upload,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

type SlotImage = { url: string; uploaded_at: string } | null;
type SlotState = {
  status: "idle" | "uploading" | "reverting";
  error: string | null;
  ok: string | null;
};

const PLACEHOLDER_SRC: Record<GondolaSlot, string> = {
  coffee: "/images/marketing/coffee-service.svg",
  "10-10-10": "/images/marketing/10-10-10.svg",
  financing: "/images/marketing/financing.svg",
  "ai-vending": "/images/marketing/ai-vending.svg",
  "website-services": "/images/marketing/website-services.svg",
};

export default function GondolaAdminPage() {
  const [token, setToken] = useState<string>("");
  const [authChecked, setAuthChecked] = useState(false);
  const [images, setImages] = useState<Record<GondolaSlot, SlotImage>>({
    coffee: null,
    "10-10-10": null,
    financing: null,
    "ai-vending": null,
    "website-services": null,
  });
  const [slotState, setSlotState] = useState<Record<GondolaSlot, SlotState>>(() => {
    const init: Record<string, SlotState> = {};
    for (const s of GONDOLA_SLOTS) init[s] = { status: "idle", error: null, ok: null };
    return init as Record<GondolaSlot, SlotState>;
  });
  const fileInputs = useRef<Record<GondolaSlot, HTMLInputElement | null>>(
    Object.fromEntries(GONDOLA_SLOTS.map((s) => [s, null])) as Record<GondolaSlot, HTMLInputElement | null>,
  );

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token ?? "");
      setAuthChecked(true);
    });
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/marketing/gondola", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setImages(data.images ?? {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function uploadForSlot(slot: GondolaSlot, file: File) {
    if (file.size > GONDOLA_MAX_BYTES) {
      setSlotState((s) => ({
        ...s,
        [slot]: {
          status: "idle",
          error: `File is larger than ${GONDOLA_MAX_BYTES / (1024 * 1024)} MB.`,
          ok: null,
        },
      }));
      return;
    }
    setSlotState((s) => ({ ...s, [slot]: { status: "uploading", error: null, ok: null } }));
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/marketing/gondola/${slot}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`);
      setImages((prev) => ({
        ...prev,
        [slot]: { url: json.url, uploaded_at: json.uploaded_at },
      }));
      setSlotState((s) => ({ ...s, [slot]: { status: "idle", error: null, ok: "Uploaded — live on the gondola." } }));
    } catch (err) {
      setSlotState((s) => ({
        ...s,
        [slot]: {
          status: "idle",
          error: err instanceof Error ? err.message : "Upload failed",
          ok: null,
        },
      }));
    }
  }

  async function revertSlot(slot: GondolaSlot) {
    if (!window.confirm(`Revert the "${GONDOLA_SLOT_LABELS[slot]}" slide to the placeholder image?`)) return;
    setSlotState((s) => ({ ...s, [slot]: { status: "reverting", error: null, ok: null } }));
    try {
      const res = await fetch(`/api/admin/marketing/gondola/${slot}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Revert failed (${res.status})`);
      setImages((prev) => ({ ...prev, [slot]: null }));
      setSlotState((s) => ({ ...s, [slot]: { status: "idle", error: null, ok: "Reverted to placeholder." } }));
    } catch (err) {
      setSlotState((s) => ({
        ...s,
        [slot]: {
          status: "idle",
          error: err instanceof Error ? err.message : "Revert failed",
          ok: null,
        },
      }));
    }
  }

  if (!authChecked) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
      </div>
    );
  }
  if (!token) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <h1 className="text-xl font-semibold text-black-primary">Sign in required</h1>
        <p className="mt-2 text-sm text-gray-600">
          Log in with an admin account to manage marketing gondola images.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-green-primary px-4 py-2 text-sm font-semibold text-white hover:bg-green-hover"
        >
          Go to Log In
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-light">
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Admin
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-black-primary sm:text-3xl">
            Marketing Gondola Images
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            Swap the 5 photos that rotate under the header on the homepage and the logged-in dashboard.
            Uploads go live immediately — no code push required. Reverting a slot restores the shipped
            placeholder image.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            PNG, JPEG, or WebP · up to {GONDOLA_MAX_BYTES / (1024 * 1024)} MB · portrait 4:5 works best.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-6">
        {GONDOLA_SLOTS.map((slot) => {
          const label = GONDOLA_SLOT_LABELS[slot];
          const uploaded = images[slot];
          const state = slotState[slot];
          const src = uploaded?.url ?? PLACEHOLDER_SRC[slot];
          return (
            <div
              key={slot}
              className="grid grid-cols-1 gap-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:grid-cols-[220px_1fr] sm:gap-6"
            >
              {/* Preview */}
              <div className="relative aspect-[4/5] w-full max-w-[220px] overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                <Image
                  key={src}
                  src={src}
                  alt={`${label} preview`}
                  fill
                  sizes="220px"
                  unoptimized
                  className="object-cover"
                />
              </div>

              {/* Controls */}
              <div className="flex flex-col">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-black-primary">{label}</h2>
                    <p className="mt-1 text-xs uppercase tracking-wider text-gray-500">
                      Slot ID: <code className="font-mono">{slot}</code>
                    </p>
                  </div>
                  <span
                    className={
                      uploaded
                        ? "inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-200"
                        : "inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200"
                    }
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    {uploaded ? "Uploaded" : "Placeholder"}
                  </span>
                </div>

                {uploaded && (
                  <p className="mt-2 text-xs text-gray-500">
                    Last uploaded: {new Date(uploaded.uploaded_at).toLocaleString()}
                  </p>
                )}

                <input
                  ref={(el) => {
                    fileInputs.current[slot] = el;
                  }}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadForSlot(slot, file);
                    // Reset so the same file can be re-selected after a
                    // failed upload without needing to pick a different file.
                    e.target.value = "";
                  }}
                />

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputs.current[slot]?.click()}
                    disabled={state.status !== "idle"}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover disabled:opacity-50"
                  >
                    {state.status === "uploading" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        {uploaded ? "Replace image" : "Upload image"}
                      </>
                    )}
                  </button>
                  {uploaded && (
                    <button
                      type="button"
                      onClick={() => revertSlot(slot)}
                      disabled={state.status !== "idle"}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                    >
                      {state.status === "reverting" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Reverting…
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-4 w-4" />
                          Revert to placeholder
                        </>
                      )}
                    </button>
                  )}
                </div>

                {state.error && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{state.error}</span>
                  </div>
                )}
                {state.ok && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{state.ok}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
