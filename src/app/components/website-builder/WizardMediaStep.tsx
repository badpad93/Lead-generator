"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, Trash2, Image as ImageIcon, Video, Plus, ExternalLink } from "lucide-react";
import { TextField } from "./fields";
import type { StepProps, WebsiteRequestMedia } from "./types";

interface Props extends StepProps {
  media: WebsiteRequestMedia[];
  token: string;
  onMediaChange: () => void;
}

const KINDS = [
  { key: "staff", label: "Staff Photos", accept: "image/*", description: "Team headshots and group photos." },
  { key: "location", label: "Location / Project Photos", accept: "image/*", description: "Installed machines in the wild." },
  { key: "machine", label: "Machine Photos", accept: "image/*", description: "Product shots of your machines." },
  { key: "product", label: "Product Photos", accept: "image/*", description: "Snacks, drinks, coffee — whatever you stock." },
  { key: "video", label: "Videos", accept: "video/mp4,video/quicktime,video/webm", description: "Short clips (MP4/MOV/WEBM, ≤ 15 MB)." },
] as const;

const SOCIAL_KEYS = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "other", label: "Other" },
];

/**
 * Step 5 — Media. Organized upload sections per media kind + a
 * video-link block (URLs for YouTube/Vimeo) + social profile URLs.
 * Logo is shown as a reference if it was uploaded in Branding — we
 * don't ask twice.
 */
export default function WizardMediaStep({ request, isReadOnly, media, token, onMediaChange, updateField }: Props) {
  const logo = media.find((m) => m.kind === "logo");
  const socialLinks = request.social_links || {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Photos &amp; Media</h2>
        <p className="text-sm text-gray-500 mt-1">
          The more real photos we have, the better your site looks. Uploads are private —
          only you and the Vending Connector team see them until launch.
        </p>
      </div>

      {logo && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo.signed_url && <img src={logo.signed_url} alt="Logo" className="h-14 w-14 object-contain rounded-lg border border-white bg-white" />}
          <div className="text-sm text-emerald-900">
            <p className="font-medium">Logo already uploaded from Branding step</p>
            <p className="text-xs text-emerald-800">Head back to Brand to replace it.</p>
          </div>
        </div>
      )}

      {KINDS.map((k) => (
        <MediaSection
          key={k.key}
          kind={k.key}
          label={k.label}
          description={k.description}
          accept={k.accept}
          media={media.filter((m) => m.kind === k.key)}
          requestId={request.id}
          token={token}
          onChange={onMediaChange}
          disabled={isReadOnly}
        />
      ))}

      {/* Video links */}
      <VideoLinkSection
        media={media.filter((m) => m.kind === "video_link")}
        requestId={request.id}
        token={token}
        onChange={onMediaChange}
        disabled={isReadOnly}
      />

      {/* Social links */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">Social Links</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SOCIAL_KEYS.map((s) => (
            <TextField
              key={s.key}
              label={s.label}
              value={socialLinks[s.key] || ""}
              onChange={(v) => updateField("social_links", { ...socialLinks, [s.key]: v })}
              disabled={isReadOnly}
              placeholder={`https://${s.key === "other" ? "example.com" : `${s.key}.com/your-page`}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MediaSection({ kind, label, description, accept, media, requestId, token, onChange, disabled }: {
  kind: string;
  label: string;
  description: string;
  accept: string;
  media: WebsiteRequestMedia[];
  requestId: string;
  token: string;
  onChange: () => void;
  disabled: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function upload(files: FileList) {
    setError(null);
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch(`/api/website-requests/${requestId}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || `Upload failed for ${file.name}`);
        break;
      }
    }
    setUploading(false);
    onChange();
  }

  async function del(id: string) {
    if (!confirm("Remove this file?")) return;
    await fetch(`/api/website-requests/${requestId}/media/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    onChange();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-gray-800">{label}</label>
        <span className="text-[11px] text-gray-500">{media.length} {media.length === 1 ? "file" : "files"}</span>
      </div>
      <p className="text-[11px] text-gray-500 mb-2">{description}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {media.map((m) => (
          <div key={m.id} className="relative group rounded-xl border border-gray-100 bg-white overflow-hidden">
            {m.mime_type?.startsWith("video/") ? (
              <div className="aspect-square flex items-center justify-center bg-gray-50">
                <Video className="h-8 w-8 text-gray-400" />
              </div>
            ) : m.signed_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.signed_url} alt={m.caption || m.file_name || ""} className="aspect-square w-full object-cover" />
            ) : (
              <div className="aspect-square flex items-center justify-center bg-gray-50">
                <ImageIcon className="h-8 w-8 text-gray-400" />
              </div>
            )}
            <div className="p-2 text-[11px] text-gray-600 truncate">{m.file_name}</div>
            {!disabled && (
              <button
                type="button"
                onClick={() => del(m.id)}
                className="absolute top-1 right-1 bg-white/90 border border-gray-200 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6 mb-1" />}
            {uploading ? "Uploading…" : "Add"}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.currentTarget.value = ""; }}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function VideoLinkSection({ media, requestId, token, onChange, disabled }: {
  media: WebsiteRequestMedia[];
  requestId: string;
  token: string;
  onChange: () => void;
  disabled: boolean;
}) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    if (!/^https?:\/\//i.test(url)) { setError("Enter a valid https URL"); return; }
    setBusy(true);
    const res = await fetch(`/api/website-requests/${requestId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind: "video_link", external_url: url, caption }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Add failed");
      return;
    }
    setUrl("");
    setCaption("");
    onChange();
  }

  async function del(id: string) {
    if (!confirm("Remove this video link?")) return;
    await fetch(`/api/website-requests/${requestId}/media/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    onChange();
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-800 mb-1">Video Links (YouTube / Vimeo)</label>
      <p className="text-[11px] text-gray-500 mb-2">Paste URLs of videos you&rsquo;d like embedded. We&rsquo;ll handle the player.</p>
      <div className="space-y-2 mb-3">
        {media.map((m) => (
          <div key={m.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white p-2">
            <a href={m.external_url || "#"} target="_blank" rel="noreferrer" className="flex-1 text-sm text-green-primary truncate hover:underline">
              <ExternalLink className="inline h-3.5 w-3.5 mr-1" /> {m.external_url}
            </a>
            {m.caption && <span className="text-[11px] text-gray-500 truncate max-w-[40%]">{m.caption}</span>}
            {!disabled && (
              <button type="button" onClick={() => del(m.id)} className="p-1 text-gray-400 hover:text-red-600" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
            )}
          </div>
        ))}
      </div>
      {!disabled && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/…"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional)"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={add}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary hover:bg-green-hover px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
