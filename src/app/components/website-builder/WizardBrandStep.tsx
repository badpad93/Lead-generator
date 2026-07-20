"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, Trash2, ImageIcon, Plus, X } from "lucide-react";
import { TextField, TextArea, ColorField, ChipToggle } from "./fields";
import type { StepProps, WebsiteRequestMedia } from "./types";

const STYLES = [
  { value: "modern", label: "Modern" },
  { value: "corporate", label: "Corporate" },
  { value: "premium", label: "Premium" },
  { value: "minimal", label: "Minimal" },
  { value: "bold", label: "Bold" },
  { value: "friendly", label: "Friendly" },
  { value: "tech_forward", label: "Tech-forward" },
  { value: "other", label: "Other" },
] as const;

interface Props extends StepProps {
  media: WebsiteRequestMedia[];
  token: string;
  onMediaChange: () => void;
}

/**
 * Step 2 — Brand. Logo upload + brand colors + preferred style + tagline
 * + inspiration sites. The logo lives in the shared media table with
 * kind='logo'; the parent request row keeps a logo_media_id FK so the
 * media step can render the same asset without a re-upload.
 */
export default function WizardBrandStep({
  request, updateField, isReadOnly, media, token, onMediaChange,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const logo = media.find((m) => m.kind === "logo");
  const style = request.preferred_style as (typeof STYLES)[number]["value"] | null;
  const inspiration = request.inspiration_sites || [];

  async function uploadLogo(file: File) {
    setError(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "logo");
    const res = await fetch(`/api/website-requests/${request.id}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    setUploading(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Upload failed");
      return;
    }
    onMediaChange();
  }

  async function deleteLogo() {
    if (!logo) return;
    if (!confirm("Remove the current logo?")) return;
    await fetch(`/api/website-requests/${request.id}/media/${logo.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    onMediaChange();
  }

  function updateInspiration(next: typeof inspiration) {
    updateField("inspiration_sites", next);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Branding</h2>
        <p className="text-sm text-gray-500 mt-1">
          Logo, colors, style. Uploads are private — only you and the Vending Connector team see them.
        </p>
      </div>

      {/* Logo upload */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Logo</label>
        <div className="flex flex-wrap items-center gap-3">
          {logo?.signed_url ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo.signed_url} alt="Logo preview" className="h-24 w-24 object-contain rounded-lg border border-gray-200 bg-gray-50" />
              {!isReadOnly && (
                <button
                  onClick={deleteLogo}
                  className="absolute -top-2 -right-2 bg-white border border-gray-200 rounded-full p-1 hover:bg-red-50 hover:border-red-200"
                  aria-label="Remove logo"
                >
                  <X className="h-3.5 w-3.5 text-red-600" />
                </button>
              )}
            </div>
          ) : (
            <div className="h-24 w-24 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50">
              <ImageIcon className="h-8 w-8 text-gray-300" />
            </div>
          )}
          {!isReadOnly && (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 cursor-pointer disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {logo ? "Replace Logo" : "Upload Logo"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.currentTarget.value = ""; }}
              />
            </>
          )}
        </div>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>

      {/* Colors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ColorField label="Primary Color" value={request.brand_primary_color} onChange={(v) => updateField("brand_primary_color", v)} disabled={isReadOnly} />
        <ColorField label="Secondary Color" value={request.brand_secondary_color} onChange={(v) => updateField("brand_secondary_color", v)} disabled={isReadOnly} />
      </div>

      {/* Preferred style */}
      <ChipToggle
        label="Preferred Style"
        options={STYLES as unknown as Array<{ value: string; label: string }>}
        selected={style ? [style] : []}
        onChange={(next) => updateField("preferred_style", next[next.length - 1] || null)}
        disabled={isReadOnly}
        hint="Pick the one that best fits your brand — we can mix and match."
      />

      {style === "other" && (
        <TextField
          label="Describe your style"
          value={request.preferred_style_other}
          onChange={(v) => updateField("preferred_style_other", v)}
          disabled={isReadOnly}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label="Fonts (optional)" value={request.fonts} onChange={(v) => updateField("fonts", v)} disabled={isReadOnly} placeholder="e.g. Inter, Poppins" />
        <TextField label="Tagline (optional)" value={request.tagline} onChange={(v) => updateField("tagline", v)} disabled={isReadOnly} placeholder="e.g. Smart vending, effortlessly." />
      </div>

      {/* Inspiration sites */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Websites / Competitors You Like</label>
        <p className="text-[11px] text-gray-500 mb-2">Add URLs of sites whose look you like, with a short note about what specifically caught your eye.</p>
        <div className="space-y-2">
          {inspiration.map((row, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="url"
                value={row.url}
                onChange={(e) => {
                  const next = [...inspiration];
                  next[i] = { ...next[i], url: e.target.value };
                  updateInspiration(next);
                }}
                placeholder="https://example.com"
                disabled={isReadOnly}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-600 focus:outline-none disabled:bg-gray-50"
              />
              <input
                type="text"
                value={row.note || ""}
                onChange={(e) => {
                  const next = [...inspiration];
                  next[i] = { ...next[i], note: e.target.value };
                  updateInspiration(next);
                }}
                placeholder="What you like about it"
                disabled={isReadOnly}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-600 focus:outline-none disabled:bg-gray-50"
              />
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => updateInspiration(inspiration.filter((_, x) => x !== i))}
                  className="rounded-lg p-2 text-gray-400 hover:text-red-600 hover:bg-red-50"
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => updateInspiration([...inspiration, { url: "", note: "" }])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add Site
            </button>
          )}
        </div>
      </div>

      <TextArea label="Notes for the design team (optional)" value={request.additional_notes} onChange={(v) => updateField("additional_notes", v)} disabled={isReadOnly} rows={3} placeholder="Anything else about the brand direction?" />
    </div>
  );
}
