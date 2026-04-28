"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import {
  Loader2,
  FileText,
  Download,
  Upload,
  Trash2,
  FolderOpen,
  Megaphone,
  BookOpen,
  FileSignature,
  DollarSign,
  GraduationCap,
  File,
  X,
} from "lucide-react";

interface Resource {
  id: string;
  title: string;
  description: string | null;
  category: string;
  file_url: string;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
}

const CATEGORIES = [
  { value: "all", label: "All", icon: FolderOpen },
  { value: "marketing", label: "Marketing", icon: Megaphone },
  { value: "guide", label: "Guides", icon: BookOpen },
  { value: "agreement", label: "Agreements", icon: FileSignature },
  { value: "pricing", label: "Pricing", icon: DollarSign },
  { value: "training", label: "Training", icon: GraduationCap },
  { value: "other", label: "Other", icon: File },
];

function categoryIcon(cat: string) {
  return CATEGORIES.find((c) => c.value === cat)?.icon || File;
}

function fmtSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ResourcesPage() {
  const [token, setToken] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "marketing",
    file: null as File | null,
  });

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) return;
      setToken(session.access_token);
      const res = await fetch("/api/sales/users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const users = await res.json();
        const me = users.find((u: { id: string }) => u.id === session.user.id);
        if (me?.role === "admin" || me?.role === "director_of_sales" || me?.role === "market_leader") setIsAdmin(true);
      }
    });
  }, []);

  const fetchResources = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/sales/resources", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setResources(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  async function handleUpload() {
    if (!form.file || !form.title.trim()) {
      setUploadError("Title and file are required");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const supabase = (await import("@/lib/supabase")).createBrowserClient();
      const safeName = form.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `resources/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(filePath, form.file, {
          upsert: false,
          contentType: form.file.type || undefined,
        });
      if (upErr) {
        setUploadError(`Upload failed: ${upErr.message}`);
        return;
      }
      const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(filePath);

      const res = await fetch("/api/sales/resources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          category: form.category,
          file_url: urlData.publicUrl,
          file_name: form.file.name,
          file_size: form.file.size,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setUploadError(err.error || "Failed to save resource");
        return;
      }
      setForm({ title: "", description: "", category: "marketing", file: null });
      setShowUpload(false);
      fetchResources();
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this resource?")) return;
    const res = await fetch(`/api/sales/resources?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to delete");
      return;
    }
    fetchResources();
  }

  const filtered = filter === "all" ? resources : resources.filter((r) => r.category === filter);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resources</h1>
          <p className="text-sm text-gray-500 mt-1">
            Marketing materials, guides, agreements, and other sales resources.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer"
          >
            <Upload className="h-4 w-4" />
            Upload Resource
          </button>
        )}
      </div>

      {showUpload && isAdmin && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Upload Resource</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="Title *"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            >
              {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            rows={2}
          />
          <input
            type="file"
            onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
            className="mt-3 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200"
          />
          {uploadError && (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <span>{uploadError}</span>
              <button onClick={() => setUploadError(null)} className="ml-3 text-red-400 hover:text-red-600 cursor-pointer"><X className="h-4 w-4" /></button>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
            <button
              onClick={() => { setShowUpload(false); setUploadError(null); }}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const active = filter === c.value;
          return (
            <button
              key={c.value}
              onClick={() => setFilter(c.value)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                active
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {c.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-green-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <FileText className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">
            No resources yet.{" "}
            {isAdmin ? "Click Upload Resource to add one." : "Check back later."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => {
            const Icon = categoryIcon(r.category);
            return (
              <div
                key={r.id}
                className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
                    <Icon className="h-5 w-5 text-green-600" />
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(r.id)}
                      title="Delete"
                      className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">{r.title}</h3>
                {r.description && (
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{r.description}</p>
                )}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400 capitalize">
                    {r.category} {fmtSize(r.file_size) && `· ${fmtSize(r.file_size)}`}
                  </span>
                  <a
                    href={r.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={r.file_name || undefined}
                    className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
