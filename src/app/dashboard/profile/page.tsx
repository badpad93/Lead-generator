"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  User,
  Building2,
  MapPin,
  Globe,
  Phone,
  Mail,
  Camera,
  X,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { US_STATES } from "@/lib/types";
import type { Profile } from "@/lib/types";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    company_name: "",
    phone: "",
    website: "",
    bio: "",
    city: "",
    state: "",
    zip: "",
    role: "" as string,
  });

  useEffect(() => {
    const supabase = createBrowserClient();

    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login?redirect=/dashboard/profile");
        return;
      }

      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          router.replace("/login?redirect=/dashboard/profile");
          return;
        }
        const data: Profile = await res.json();
        setProfile(data);
        setAvatarPreview(data.avatar_url || null);
        setForm({
          full_name: data.full_name || "",
          company_name: data.company_name || "",
          phone: data.phone || "",
          website: data.website || "",
          bio: data.bio || "",
          city: data.city || "",
          state: data.state || "",
          zip: data.zip || "",
          role: data.role || "requestor",
        });
      } catch {
        router.replace("/login?redirect=/dashboard/profile");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [router]);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith("image/")) {
      setToast({ message: "Please select an image file.", type: "error" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setToast({ message: "Image must be less than 5MB.", type: "error" });
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function removeAvatar() {
    setAvatarFile(null);
    setAvatarPreview(null);
  }

  async function uploadAvatar(session: { access_token: string }): Promise<string | null> {
    if (!avatarFile || !profile) return profile?.avatar_url || null;

    setUploadingAvatar(true);
    try {
      const supabase = createBrowserClient();
      const ext = avatarFile.name.split(".").pop() || "jpg";
      const filePath = `${profile.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, avatarFile, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      // Add cache-busting param so browser doesn't serve stale image
      return `${urlData.publicUrl}?t=${Date.now()}`;
    } catch {
      setToast({ message: "Failed to upload avatar.", type: "error" });
      return profile?.avatar_url || null;
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setToast(null);

    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Upload avatar if a new file was selected
      let avatarUrl = profile.avatar_url;
      if (avatarFile) {
        avatarUrl = await uploadAvatar(session);
      } else if (avatarPreview === null && profile.avatar_url) {
        // Avatar was removed
        avatarUrl = null;
      }

      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          full_name: form.full_name,
          company_name: form.company_name || null,
          phone: form.phone || null,
          website: form.website || null,
          bio: form.bio || null,
          city: form.city || null,
          state: form.state || null,
          zip: form.zip || null,
          role: form.role,
          avatar_url: avatarUrl,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setToast({ message: data.error || "Failed to save", type: "error" });
        return;
      }

      const updated = await res.json();
      setProfile(updated);
      setAvatarFile(null);
      setAvatarPreview(updated.avatar_url || null);
      setToast({ message: "Profile saved successfully!", type: "success" });
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast({ message: "Network error. Please try again.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-160px)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-primary" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-black-primary/50 transition-colors hover:text-green-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50">
              <User className="h-6 w-6 text-green-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-black-primary">
                Edit Profile
              </h1>
              <p className="text-sm text-black-primary/50">
                {profile.email}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <form onSubmit={handleSave} className="space-y-6">
          {/* Profile Photo */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-black-primary">
              Profile Photo
            </h2>
            <div className="flex items-center gap-6">
              <div className="relative">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Profile"
                    className="h-20 w-20 rounded-full object-cover ring-4 ring-green-100"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-primary text-2xl font-bold text-white ring-4 ring-green-100">
                    {(form.full_name || "U")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>
                )}
                {avatarPreview && (
                  <button
                    type="button"
                    onClick={removeAvatar}
                    className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-sm hover:bg-red-600 transition-colors"
                    title="Remove photo"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-black-primary transition-colors hover:bg-gray-50">
                  <Camera className="h-4 w-4 text-black-primary/40" />
                  {avatarPreview ? "Change Photo" : "Upload Photo"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </label>
                <p className="mt-1.5 text-xs text-gray-400">
                  JPG, PNG, or GIF. Max 5MB.
                </p>
              </div>
            </div>
          </div>

          {/* Personal Info */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-black-primary">
              Personal Information
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-black-primary">
                  <User className="h-4 w-4 text-black-primary/40" />
                  Full Name *
                </label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  required
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-black-primary">
                  <Building2 className="h-4 w-4 text-black-primary/40" />
                  Company Name
                </label>
                <input
                  type="text"
                  value={form.company_name}
                  onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-black-primary">
                  Role
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                >
                  <option value="operator">Operator</option>
                  <option value="location_manager">Location Manager</option>
                  <option value="requestor">Requestor</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-black-primary">
                  Bio
                </label>
                <textarea
                  rows={3}
                  value={form.bio}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                  placeholder="Tell others about yourself or your business..."
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-black-primary">
              Contact Information
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-black-primary">
                    <Phone className="h-4 w-4 text-black-primary/40" />
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="(555) 123-4567"
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                  />
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-black-primary">
                    <Globe className="h-4 w-4 text-black-primary/40" />
                    Website
                  </label>
                  <input
                    type="url"
                    value={form.website}
                    onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                    placeholder="https://example.com"
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-1.5 text-lg font-semibold text-black-primary">
              <MapPin className="h-5 w-5 text-black-primary/40" />
              Location
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-black-primary">
                  City
                </label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-black-primary">
                  State
                </label>
                <select
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                >
                  <option value="">Select State</option>
                  {US_STATES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-black-primary">
                  ZIP Code
                </label>
                <input
                  type="text"
                  value={form.zip}
                  onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                  maxLength={10}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-primary focus:outline-none focus:ring-1 focus:ring-green-primary"
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-black-primary transition-colors hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Save Changes
            </button>
          </div>
        </form>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
