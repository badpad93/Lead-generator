"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Loader2,
  ChevronLeft,
  AlertCircle,
  CheckCircle2,
  Upload,
  FileText,
  X,
} from "lucide-react";
import { getAccessToken } from "@/lib/auth";
import { createBrowserClient } from "@/lib/supabase";
import { US_STATES, US_STATE_NAMES } from "@/lib/types";

const MACHINE_TYPE_OPTIONS = [
  "Snack",
  "Beverage",
  "Combo",
  "Coffee",
  "Micro Market",
  "Cold Food",
  "Frozen",
  "Healthy",
  "AI Machine",
  "Specialty",
  "Other",
];

const CONDITION_OPTIONS: { value: string; label: string }[] = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "for_parts", label: "For Parts" },
];

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

type UploadedFile = {
  /** Canonical URL stored in machine_listings.photos[]. For images this
   *  is the 1200w WebP; for PDFs it's the raw PDF. */
  url: string;
  name: string;
  isPdf: boolean;
  /** Only populated for processed images. */
  thumbUrl?: string;
  mediumUrl?: string;
  mainUrl?: string;
};

export default function PostMachinePage() {
  const [token, setToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [machineMake, setMachineMake] = useState("");
  const [machineModel, setMachineModel] = useState("");
  const [machineYear, setMachineYear] = useState("");
  const [machineType, setMachineType] = useState("");
  const [condition, setCondition] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [askingPrice, setAskingPrice] = useState("");
  const [includesCardReader, setIncludesCardReader] = useState(false);
  const [includesInstall, setIncludesInstall] = useState(false);
  const [includesDelivery, setIncludesDelivery] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  useEffect(() => {
    getAccessToken().then(setToken);
  }, []);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    // Reset input so the same file can be re-picked after removal
    e.target.value = "";
    if (selected.length === 0) return;

    setUploadError(null);

    const remaining = MAX_FILES - files.length;
    if (remaining <= 0) {
      setUploadError(`Maximum ${MAX_FILES} files allowed`);
      return;
    }

    const toUpload = selected.slice(0, remaining);
    if (selected.length > remaining) {
      setUploadError(
        `Only uploading the first ${remaining} file(s) (max ${MAX_FILES} total).`
      );
    }

    setUploading(true);
    try {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setUploadError("You must be signed in to upload files.");
        return;
      }

      const currentToken = token || (await getAccessToken());
      if (!currentToken) {
        setUploadError("You must be signed in to upload files.");
        return;
      }

      const newFiles: UploadedFile[] = [];
      for (const file of toUpload) {
        if (file.size > MAX_FILE_SIZE) {
          setUploadError(`${file.name} is larger than 10 MB and was skipped.`);
          continue;
        }
        const isImage = file.type.startsWith("image/");
        const isPdf = file.type === "application/pdf";
        if (!isImage && !isPdf) {
          setUploadError(`${file.name} is not an image or PDF.`);
          continue;
        }

        if (isPdf) {
          // PDFs: direct upload, unchanged
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `machine-listings/${user.id}/${Date.now()}-${safeName}`;
          const { error: uploadErr } = await supabase.storage
            .from("documents")
            .upload(path, file, {
              upsert: false,
              contentType: file.type || undefined,
            });
          if (uploadErr) {
            setUploadError(
              `Failed to upload ${file.name}: ${uploadErr.message}`
            );
            continue;
          }
          const { data: urlData } = supabase.storage
            .from("documents")
            .getPublicUrl(path);
          newFiles.push({
            url: urlData.publicUrl,
            name: file.name,
            isPdf: true,
          });
          continue;
        }

        // Images: upload to staging, then let the server resize + convert
        const rawExt = (file.name.split(".").pop() || "img")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        const ext = rawExt || "img";
        const stagingId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const stagingPath = `machine-listings/${user.id}/_staging/${stagingId}.${ext}`;

        const { error: stagingErr } = await supabase.storage
          .from("documents")
          .upload(stagingPath, file, {
            upsert: false,
            contentType: file.type || undefined,
          });
        if (stagingErr) {
          setUploadError(
            `Failed to upload ${file.name}: ${stagingErr.message}`
          );
          continue;
        }

        let processRes: Response;
        try {
          processRes = await fetch("/api/machine-listings/process-image", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${currentToken}`,
            },
            body: JSON.stringify({ stagingPath }),
          });
        } catch {
          await supabase.storage
            .from("documents")
            .remove([stagingPath]);
          setUploadError(`${file.name}: network error while processing image`);
          continue;
        }

        if (!processRes.ok) {
          let msg = "image processing failed";
          try {
            const errBody = (await processRes.json()) as { error?: unknown };
            if (typeof errBody.error === "string") msg = errBody.error;
          } catch {
            // ignore
          }
          // Best-effort cleanup in case the server exited before it could
          await supabase.storage.from("documents").remove([stagingPath]);
          setUploadError(`${file.name}: ${msg}`);
          continue;
        }

        const processed = (await processRes.json()) as {
          thumbUrl: string;
          mediumUrl: string;
          mainUrl: string;
          originalUrl: string;
        };

        newFiles.push({
          // Canonical URL in photos[] is the 1200w main WebP so any legacy
          // renderer (or the detail page's gallery) gets a fast image.
          url: processed.mainUrl,
          name: file.name,
          isPdf: false,
          thumbUrl: processed.thumbUrl,
          mediumUrl: processed.mediumUrl,
          mainUrl: processed.mainUrl,
        });
      }

      if (newFiles.length > 0) {
        setFiles((prev) => [...prev, ...newFiles]);
      }
    } finally {
      setUploading(false);
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!title.trim()) {
      setSubmitError("Title is required");
      return;
    }
    if (!city.trim()) {
      setSubmitError("City is required");
      return;
    }
    if (!state) {
      setSubmitError("State is required");
      return;
    }

    setSubmitting(true);
    try {
      const currentToken = token || (await getAccessToken());
      if (!currentToken) {
        setSubmitError("You must be logged in. Please sign in first.");
        return;
      }

      const photos = files.map((f) => f.url);
      // Auto-select the first image as the primary one for structured
      // image fields. PDFs are skipped.
      const primary = files.find((f) => !f.isPdf && f.mainUrl);

      const res = await fetch("/api/machine-listings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          city: city.trim(),
          state,
          machine_make: machineMake.trim() || undefined,
          machine_model: machineModel.trim() || undefined,
          machine_year: machineYear ? parseInt(machineYear) : undefined,
          machine_type: machineType || undefined,
          condition: condition || undefined,
          quantity: parseInt(quantity) || 1,
          asking_price: askingPrice ? parseFloat(askingPrice) : undefined,
          includes_card_reader: includesCardReader,
          includes_install: includesInstall,
          includes_delivery: includesDelivery,
          photos,
          image_thumb_url: primary?.thumbUrl ?? null,
          image_medium_url: primary?.mediumUrl ?? null,
          image_main_url: primary?.mainUrl ?? null,
          contact_email: contactEmail.trim() || undefined,
          contact_phone: contactPhone.trim() || undefined,
        }),
      });

      if (!res.ok) {
        try {
          const data = await res.json();
          setSubmitError(
            typeof data.error === "string"
              ? data.error
              : "Something went wrong."
          );
        } catch {
          setSubmitError("Something went wrong.");
        }
        return;
      }

      setSubmitted(true);
    } catch {
      setSubmitError("Network error. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-[calc(100vh-160px)] px-4 py-10 sm:py-14 flex items-center justify-center">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50">
            <CheckCircle2 className="h-8 w-8 text-green-primary" />
          </div>
          <h1 className="text-2xl font-bold text-black-primary mb-2">
            Machine Submitted for Review
          </h1>
          <p className="text-black-primary/60 mb-6">
            Your machine listing has been submitted and is pending admin
            approval. You will be notified once it is approved and visible to
            buyers.
          </p>
          <Link
            href="/machines-for-sale"
            className="inline-flex items-center gap-2 rounded-xl bg-green-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
          >
            Back to Machines for Sale
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-160px)] px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/machines-for-sale"
          className="inline-flex items-center gap-1.5 text-sm text-black-primary/60 hover:text-green-primary transition-colors mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Machines for Sale
        </Link>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-black-primary">
            Post a Machine for Sale
          </h1>
          <p className="text-black-primary/60 mt-2">
            List a used vending machine for interested buyers. All submissions
            are reviewed by admin before going live.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 space-y-6"
        >
          {submitError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-black-primary mb-1.5"
            >
              Listing Title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. AMS 39 Combo Machine - Excellent Condition"
              maxLength={200}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-black-primary mb-1.5"
            >
              Description{" "}
              <span className="text-black-primary/30 font-normal">
                (optional)
              </span>
            </label>
            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the machine — features, age, service history, reason for selling..."
              maxLength={5000}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
            />
          </div>

          {/* Make / Model */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="machineMake"
                className="block text-sm font-medium text-black-primary mb-1.5"
              >
                Make{" "}
                <span className="text-black-primary/30 font-normal">
                  (optional)
                </span>
              </label>
              <input
                id="machineMake"
                type="text"
                value={machineMake}
                onChange={(e) => setMachineMake(e.target.value)}
                placeholder="e.g. AMS, Crane, Royal"
                maxLength={100}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
              />
            </div>
            <div>
              <label
                htmlFor="machineModel"
                className="block text-sm font-medium text-black-primary mb-1.5"
              >
                Model{" "}
                <span className="text-black-primary/30 font-normal">
                  (optional)
                </span>
              </label>
              <input
                id="machineModel"
                type="text"
                value={machineModel}
                onChange={(e) => setMachineModel(e.target.value)}
                placeholder="e.g. 39 VCB, BEVMAX"
                maxLength={100}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
              />
            </div>
          </div>

          {/* Year / Type / Condition */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="machineYear"
                className="block text-sm font-medium text-black-primary mb-1.5"
              >
                Year{" "}
                <span className="text-black-primary/30 font-normal">
                  (optional)
                </span>
              </label>
              <input
                id="machineYear"
                type="number"
                min="1950"
                max="2100"
                value={machineYear}
                onChange={(e) => setMachineYear(e.target.value)}
                placeholder="e.g. 2020"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
              />
            </div>
            <div>
              <label
                htmlFor="machineType"
                className="block text-sm font-medium text-black-primary mb-1.5"
              >
                Type
              </label>
              <select
                id="machineType"
                value={machineType}
                onChange={(e) => setMachineType(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
              >
                <option value="">Select type</option>
                {MACHINE_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="condition"
                className="block text-sm font-medium text-black-primary mb-1.5"
              >
                Condition
              </label>
              <select
                id="condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
              >
                <option value="">Select condition</option>
                {CONDITION_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* City & State */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="city"
                className="block text-sm font-medium text-black-primary mb-1.5"
              >
                City <span className="text-red-500">*</span>
              </label>
              <input
                id="city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Denver"
                maxLength={100}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
              />
            </div>
            <div>
              <label
                htmlFor="state"
                className="block text-sm font-medium text-black-primary mb-1.5"
              >
                State <span className="text-red-500">*</span>
              </label>
              <select
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
              >
                <option value="">Select state</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s} - {US_STATE_NAMES[s] ?? s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quantity & Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="quantity"
                className="block text-sm font-medium text-black-primary mb-1.5"
              >
                Quantity <span className="text-red-500">*</span>
              </label>
              <input
                id="quantity"
                type="number"
                min="1"
                max="1000"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
              />
            </div>
            <div>
              <label
                htmlFor="askingPrice"
                className="block text-sm font-medium text-black-primary mb-1.5"
              >
                Asking Price ($){" "}
                <span className="text-black-primary/30 font-normal">
                  (optional)
                </span>
              </label>
              <input
                id="askingPrice"
                type="number"
                min="0"
                step="0.01"
                value={askingPrice}
                onChange={(e) => setAskingPrice(e.target.value)}
                placeholder="e.g. 2500"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
              />
            </div>
          </div>

          {/* Photos & PDFs */}
          <div>
            <label className="block text-sm font-medium text-black-primary mb-1.5">
              Photos & Spec Sheets{" "}
              <span className="text-black-primary/30 font-normal">
                (optional, images or PDFs, max {MAX_FILES} files, 10 MB each)
              </span>
            </label>

            {uploadError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}

            <label
              htmlFor="fileUpload"
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center transition-colors ${
                uploading || files.length >= MAX_FILES
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer hover:border-green-primary hover:bg-green-50"
              }`}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-6 w-6 text-green-primary animate-spin" />
                  <span className="text-sm text-black-primary/60">
                    Uploading...
                  </span>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-green-primary" />
                  <span className="text-sm font-medium text-black-primary">
                    Click to upload photos or PDFs
                  </span>
                  <span className="text-xs text-black-primary/50">
                    JPG, PNG, GIF, WebP, or PDF — up to 10 MB each
                  </span>
                </>
              )}
              <input
                id="fileUpload"
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={handleFileSelect}
                disabled={uploading || files.length >= MAX_FILES}
                className="hidden"
              />
            </label>

            {files.length > 0 && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {files.map((file, i) => (
                  <div
                    key={`${file.url}-${i}`}
                    className="relative rounded-lg border border-gray-200 bg-white overflow-hidden group"
                  >
                    {file.isPdf ? (
                      <div className="flex flex-col items-center justify-center h-24 p-3 text-center bg-red-50">
                        <FileText className="h-8 w-8 text-red-600 mb-1" />
                        <span className="text-xs font-medium text-black-primary truncate w-full">
                          {file.name}
                        </span>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={file.thumbUrl ?? file.url}
                        alt={file.name}
                        loading="lazy"
                        className="h-24 w-full object-cover"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/90"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Includes toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-green-50 rounded-xl p-4">
              <div>
                <p className="text-sm font-semibold text-black-primary">
                  Card Reader Included?
                </p>
                <p className="text-xs text-black-primary/50 mt-0.5">
                  Is a credit card reader (cashless) installed?
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={includesCardReader}
                onClick={() => setIncludesCardReader(!includesCardReader)}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors ${
                  includesCardReader ? "bg-green-primary" : "bg-gray-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform mt-1 ${
                    includesCardReader ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between bg-green-50 rounded-xl p-4">
              <div>
                <p className="text-sm font-semibold text-black-primary">
                  Installation Included?
                </p>
                <p className="text-xs text-black-primary/50 mt-0.5">
                  Will you install the machine for the buyer?
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={includesInstall}
                onClick={() => setIncludesInstall(!includesInstall)}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors ${
                  includesInstall ? "bg-green-primary" : "bg-gray-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform mt-1 ${
                    includesInstall ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between bg-green-50 rounded-xl p-4">
              <div>
                <p className="text-sm font-semibold text-black-primary">
                  Delivery Included?
                </p>
                <p className="text-xs text-black-primary/50 mt-0.5">
                  Will you deliver the machine to the buyer?
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={includesDelivery}
                onClick={() => setIncludesDelivery(!includesDelivery)}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors ${
                  includesDelivery ? "bg-green-primary" : "bg-gray-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform mt-1 ${
                    includesDelivery ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="contactEmail"
                className="block text-sm font-medium text-black-primary mb-1.5"
              >
                Contact Email{" "}
                <span className="text-black-primary/30 font-normal">
                  (optional)
                </span>
              </label>
              <input
                id="contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
              />
            </div>
            <div>
              <label
                htmlFor="contactPhone"
                className="block text-sm font-medium text-black-primary mb-1.5"
              >
                Contact Phone{" "}
                <span className="text-black-primary/30 font-normal">
                  (optional)
                </span>
              </label>
              <input
                id="contactPhone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="(555) 123-4567"
                maxLength={20}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black-primary focus:border-green-primary focus:ring-2 focus:ring-green-primary/20"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-primary hover:bg-green-hover text-white rounded-xl font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Posting Machine...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Post Machine for Sale
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
