"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Loader2,
  Briefcase,
  MapPin,
  Clock,
  DollarSign,
  ChevronRight,
  Send,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowLeft,
  Upload,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface JobPosting {
  id: string;
  title: string;
  slug: string;
  description: string;
  hourly_rate: string | null;
  location_type: string;
  employment_type: string;
  requirements: string | null;
  benefits: string | null;
}

const LOCATION_LABELS: Record<string, string> = {
  remote: "Remote",
  "on-site": "On-Site",
  hybrid: "Hybrid",
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  "full-time": "Full-Time",
  "part-time": "Part-Time",
  contract: "Contract",
};

export default function CareersPage() {
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [applyForm, setApplyForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    cover_letter: "",
  });
  const [resumeUrl, setResumeUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchJobs() {
      try {
        const res = await fetch("/api/careers");
        if (res.ok) {
          const data = await res.json();
          setJobs(data.jobs || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchJobs();
  }, []);

  function openJob(job: JobPosting) {
    setSelectedJob(job);
    setShowApplyForm(false);
    setSubmitted(false);
    setError(null);
    setApplyForm({ full_name: "", email: "", phone: "", cover_letter: "" });
    setResumeUrl("");
  }

  async function handleResumeUpload(file: File) {
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.type)) {
      setError("Please upload a PDF or Word document");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Resume must be under 10MB");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `career-resumes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (uploadErr) {
        setError(`Upload failed: ${uploadErr.message}`);
        return;
      }
      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
      setResumeUrl(urlData.publicUrl);
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedJob) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/careers/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_posting_id: selectedJob.id,
          full_name: applyForm.full_name,
          email: applyForm.email,
          phone: applyForm.phone || null,
          resume_url: resumeUrl || null,
          cover_letter: applyForm.cover_letter || null,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
        setShowApplyForm(false);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to submit application");
      }
    } catch {
      setError("Failed to submit application");
    } finally {
      setSubmitting(false);
    }
  }

  function renderLines(text: string | null) {
    if (!text) return null;
    return text.split("\n").map((line, i) => (
      <p key={i} className={line.trim() === "" ? "h-2" : "text-gray-300 text-sm leading-relaxed"}>
        {line}
      </p>
    ));
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-green-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Hero */}
      <div className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-green-500/10 px-4 py-1.5 text-sm font-medium text-green-400 mb-6">
            <Briefcase className="h-4 w-4" />
            We&apos;re Hiring
          </div>
          <h1 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            Join the Vending Connector Team
          </h1>
          <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
            Help us revolutionize the vending industry. We&apos;re looking for passionate people
            to grow with us.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Job detail view */}
        {selectedJob ? (
          <div>
            <button
              type="button"
              onClick={() => { setSelectedJob(null); setShowApplyForm(false); setSubmitted(false); }}
              className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-green-400 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to all positions
            </button>

            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">{selectedJob.title}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {selectedJob.hourly_rate && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-sm text-green-400">
                        <DollarSign className="h-3.5 w-3.5" />
                        {selectedJob.hourly_rate}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-sm text-blue-400">
                      <MapPin className="h-3.5 w-3.5" />
                      {LOCATION_LABELS[selectedJob.location_type] || selectedJob.location_type}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-3 py-1 text-sm text-purple-400">
                      <Clock className="h-3.5 w-3.5" />
                      {EMPLOYMENT_LABELS[selectedJob.employment_type] || selectedJob.employment_type}
                    </span>
                  </div>
                </div>
                {!submitted && !showApplyForm && (
                  <button
                    type="button"
                    onClick={() => setShowApplyForm(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 cursor-pointer shrink-0"
                  >
                    <Send className="h-4 w-4" />
                    Apply Now
                  </button>
                )}
              </div>

              {/* Success */}
              {submitted && (
                <div className="mb-6 rounded-xl bg-green-500/10 border border-green-500/20 p-6 text-center">
                  <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-white mb-1">Application Submitted!</h3>
                  <p className="text-gray-400 text-sm">
                    Thank you for your interest. We&apos;ll review your application and get back to you soon.
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mb-6 rounded-xl bg-red-500/10 border border-red-500/20 p-4 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
                  <p className="text-red-400 text-sm">{error}</p>
                  <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300 cursor-pointer">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Apply form */}
              {showApplyForm && !submitted && (
                <div className="mb-8 rounded-xl border border-gray-700 bg-gray-800/50 p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Apply for {selectedJob.title}</h3>
                  <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-300">Full Name *</label>
                      <input
                        type="text"
                        required
                        value={applyForm.full_name}
                        onChange={(e) => setApplyForm((f) => ({ ...f, full_name: e.target.value }))}
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                        placeholder="John Smith"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-300">Email *</label>
                      <input
                        type="email"
                        required
                        value={applyForm.email}
                        onChange={(e) => setApplyForm((f) => ({ ...f, email: e.target.value }))}
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                        placeholder="john@example.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-300">Phone</label>
                      <input
                        type="tel"
                        value={applyForm.phone}
                        onChange={(e) => setApplyForm((f) => ({ ...f, phone: e.target.value }))}
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-300">Resume</label>
                      <div className="relative">
                        {resumeUrl ? (
                          <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-400">
                            <CheckCircle2 className="h-4 w-4" />
                            Resume uploaded
                            <button
                              type="button"
                              onClick={() => setResumeUrl("")}
                              className="ml-auto text-green-400 hover:text-green-300 cursor-pointer"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-700 px-4 py-2.5 text-sm text-gray-500 transition-colors hover:border-green-500/50 hover:text-green-400">
                            {uploading ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <Upload className="h-4 w-4" />
                                Upload PDF or Word
                              </>
                            )}
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx"
                              className="hidden"
                              disabled={uploading}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleResumeUpload(file);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-sm font-medium text-gray-300">Cover Letter</label>
                      <textarea
                        rows={4}
                        value={applyForm.cover_letter}
                        onChange={(e) => setApplyForm((f) => ({ ...f, cover_letter: e.target.value }))}
                        className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 resize-none"
                        placeholder="Tell us why you'd be a great fit..."
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setShowApplyForm(false)}
                        className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                      >
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        Submit Application
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Job details */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-green-400 mb-3">About the Role</h3>
                  <div className="space-y-1">{renderLines(selectedJob.description)}</div>
                </div>

                {selectedJob.requirements && (
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-green-400 mb-3">Requirements</h3>
                    <div className="space-y-1">{renderLines(selectedJob.requirements)}</div>
                  </div>
                )}

                {selectedJob.benefits && (
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-green-400 mb-3">Benefits</h3>
                    <div className="space-y-1">{renderLines(selectedJob.benefits)}</div>
                  </div>
                )}
              </div>

              {/* Bottom apply CTA */}
              {!submitted && !showApplyForm && (
                <div className="mt-8 pt-6 border-t border-gray-800 text-center">
                  <button
                    type="button"
                    onClick={() => setShowApplyForm(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 cursor-pointer"
                  >
                    <Send className="h-4 w-4" />
                    Apply for this Position
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Job listing grid */
          <div>
            <h2 className="text-xl font-bold text-white mb-6">Open Positions</h2>
            {jobs.length === 0 ? (
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-12 text-center">
                <Briefcase className="h-10 w-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No open positions at this time. Check back soon!</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {jobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => openJob(job)}
                    className="group w-full text-left rounded-2xl border border-gray-800 bg-gray-900 p-6 transition-all hover:border-green-500/30 hover:bg-gray-900/80 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-white group-hover:text-green-400 transition-colors">
                          {job.title}
                        </h3>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {job.hourly_rate && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs text-green-400">
                              <DollarSign className="h-3 w-3" />
                              {job.hourly_rate}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs text-blue-400">
                            <MapPin className="h-3 w-3" />
                            {LOCATION_LABELS[job.location_type] || job.location_type}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs text-purple-400">
                            <Clock className="h-3 w-3" />
                            {EMPLOYMENT_LABELS[job.employment_type] || job.employment_type}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-gray-400 line-clamp-2">{job.description}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-600 group-hover:text-green-400 transition-colors shrink-0 mt-1" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
