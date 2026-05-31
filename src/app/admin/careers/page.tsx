"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Shield,
  Loader2,
  Briefcase,
  FileText,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronDown,
  ArrowLeft,
  Eye,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

type Tab = "postings" | "applications";

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
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface JobApplication {
  id: string;
  job_posting_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  resume_url: string | null;
  cover_letter: string | null;
  status: string;
  created_at: string;
  job_postings: { id: string; title: string } | null;
}

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${
        type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
      }`}
    >
      {type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      {message}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  reviewed: "bg-blue-100 text-blue-700",
  interviewed: "bg-purple-100 text-purple-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const APP_STATUSES = ["pending", "reviewed", "interviewed", "hired", "rejected"];

const inputClass =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

export default function AdminCareersPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("postings");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);

  const [showJobForm, setShowJobForm] = useState(false);
  const [editingJob, setEditingJob] = useState<JobPosting | null>(null);
  const [jobForm, setJobForm] = useState({
    title: "",
    description: "",
    hourly_rate: "",
    location_type: "remote",
    employment_type: "full-time",
    requirements: "",
    benefits: "",
    active: true,
    sort_order: "0",
  });
  const [savingJob, setSavingJob] = useState(false);
  const [deletingJob, setDeletingJob] = useState<string | null>(null);
  const [updatingApp, setUpdatingApp] = useState<string | null>(null);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [deletingApp, setDeletingApp] = useState<string | null>(null);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        router.push("/login");
        return;
      }
      setToken(session.access_token);
      try {
        const adminRes = await fetch("/api/admin/check", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!adminRes.ok) {
          router.push("/");
          return;
        }
        const adminData = await adminRes.json();
        if (!adminData.isAdmin) {
          router.push("/");
          return;
        }
      } catch {
        router.push("/");
        return;
      }
      setLoading(false);
    }
    init();
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/careers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        setApplications(data.applications || []);
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    if (token) fetchData();
  }, [token, fetchData]);

  function resetJobForm() {
    setJobForm({
      title: "",
      description: "",
      hourly_rate: "",
      location_type: "remote",
      employment_type: "full-time",
      requirements: "",
      benefits: "",
      active: true,
      sort_order: "0",
    });
    setEditingJob(null);
    setShowJobForm(false);
  }

  function startEditJob(job: JobPosting) {
    setJobForm({
      title: job.title,
      description: job.description,
      hourly_rate: job.hourly_rate || "",
      location_type: job.location_type,
      employment_type: job.employment_type,
      requirements: job.requirements || "",
      benefits: job.benefits || "",
      active: job.active,
      sort_order: String(job.sort_order),
    });
    setEditingJob(job);
    setShowJobForm(true);
  }

  async function handleSaveJob(e: React.FormEvent) {
    e.preventDefault();
    setSavingJob(true);
    try {
      const body: Record<string, unknown> = {
        title: jobForm.title,
        description: jobForm.description,
        hourly_rate: jobForm.hourly_rate || null,
        location_type: jobForm.location_type,
        employment_type: jobForm.employment_type,
        requirements: jobForm.requirements || null,
        benefits: jobForm.benefits || null,
        active: jobForm.active,
        sort_order: parseInt(jobForm.sort_order) || 0,
      };

      if (editingJob) {
        body.id = editingJob.id;
      }

      const res = await fetch("/api/admin/careers", {
        method: editingJob ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        showToast(editingJob ? "Job posting updated" : "Job posting created", "success");
        resetJobForm();
        fetchData();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to save job posting", "error");
      }
    } catch {
      showToast("Failed to save job posting", "error");
    } finally {
      setSavingJob(false);
    }
  }

  async function handleDeleteJob(id: string) {
    if (!confirm("Delete this job posting? All applications for it will also be deleted.")) return;
    setDeletingJob(id);
    try {
      const res = await fetch("/api/admin/careers", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        showToast("Job posting deleted", "success");
        fetchData();
      } else {
        showToast("Failed to delete job posting", "error");
      }
    } catch {
      showToast("Failed to delete job posting", "error");
    } finally {
      setDeletingJob(null);
    }
  }

  async function handleToggleActive(job: JobPosting) {
    try {
      const res = await fetch("/api/admin/careers", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: job.id, active: !job.active }),
      });
      if (res.ok) fetchData();
    } catch {}
  }

  async function handleUpdateAppStatus(appId: string, status: string) {
    setUpdatingApp(appId);
    try {
      const res = await fetch("/api/admin/careers/applications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: appId, status }),
      });
      if (res.ok) {
        showToast("Application status updated", "success");
        fetchData();
      } else {
        showToast("Failed to update status", "error");
      }
    } catch {
      showToast("Failed to update status", "error");
    } finally {
      setUpdatingApp(null);
    }
  }

  async function handleDeleteApp(id: string) {
    if (!confirm("Delete this application?")) return;
    setDeletingApp(id);
    try {
      const res = await fetch("/api/admin/careers/applications", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        showToast("Application deleted", "success");
        fetchData();
      } else {
        showToast("Failed to delete application", "error");
      }
    } catch {
      showToast("Failed to delete application", "error");
    } finally {
      setDeletingApp(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "postings", label: "Job Postings", icon: <Briefcase className="h-4 w-4" />, count: jobs.length },
    {
      key: "applications",
      label: "Applications",
      icon: <FileText className="h-4 w-4" />,
      count: applications.filter((a) => a.status === "pending").length,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-green-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin Panel
        </Link>
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Careers Management</h1>
        </div>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-gray-200 pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === tab.key
                ? "border-green-600 text-green-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  activeTab === tab.key ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Job Postings Tab */}
      {activeTab === "postings" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">{jobs.length} posting(s)</p>
            <button
              type="button"
              onClick={() => {
                resetJobForm();
                setShowJobForm(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add Job Posting
            </button>
          </div>

          {showJobForm && (
            <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  {editingJob ? "Edit Job Posting" : "New Job Posting"}
                </h2>
                <button type="button" onClick={resetJobForm} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSaveJob} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Job Title</label>
                  <input
                    type="text"
                    required
                    value={jobForm.title}
                    onChange={(e) => setJobForm((f) => ({ ...f, title: e.target.value }))}
                    className={inputClass}
                    placeholder="e.g. Remote Sales Representative"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Pay Rate</label>
                  <input
                    type="text"
                    value={jobForm.hourly_rate}
                    onChange={(e) => setJobForm((f) => ({ ...f, hourly_rate: e.target.value }))}
                    className={inputClass}
                    placeholder="e.g. $15 - $22/hr"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Location Type</label>
                  <select
                    value={jobForm.location_type}
                    onChange={(e) => setJobForm((f) => ({ ...f, location_type: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="remote">Remote</option>
                    <option value="on-site">On-Site</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Employment Type</label>
                  <select
                    value={jobForm.employment_type}
                    onChange={(e) => setJobForm((f) => ({ ...f, employment_type: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="full-time">Full-Time</option>
                    <option value="part-time">Part-Time</option>
                    <option value="contract">Contract</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Sort Order</label>
                  <input
                    type="number"
                    value={jobForm.sort_order}
                    onChange={(e) => setJobForm((f) => ({ ...f, sort_order: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    rows={4}
                    required
                    value={jobForm.description}
                    onChange={(e) => setJobForm((f) => ({ ...f, description: e.target.value }))}
                    className={inputClass + " resize-none"}
                    placeholder="Describe the role and responsibilities..."
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Requirements</label>
                  <textarea
                    rows={4}
                    value={jobForm.requirements}
                    onChange={(e) => setJobForm((f) => ({ ...f, requirements: e.target.value }))}
                    className={inputClass + " resize-none"}
                    placeholder="- Requirement 1&#10;- Requirement 2&#10;- Requirement 3"
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Benefits</label>
                  <textarea
                    rows={4}
                    value={jobForm.benefits}
                    onChange={(e) => setJobForm((f) => ({ ...f, benefits: e.target.value }))}
                    className={inputClass + " resize-none"}
                    placeholder="- Benefit 1&#10;- Benefit 2&#10;- Benefit 3"
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={jobForm.active}
                      onChange={(e) => setJobForm((f) => ({ ...f, active: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-gray-700">Active (visible on careers page)</span>
                  </label>
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      onClick={resetJobForm}
                      className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingJob}
                      className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                    >
                      {savingJob && <Loader2 className="h-4 w-4 animate-spin" />}
                      {editingJob ? "Update" : "Create"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Title</th>
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Pay Rate</th>
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Location</th>
                    <th className="px-5 py-3 text-left font-semibold text-gray-600">Type</th>
                    <th className="px-5 py-3 text-center font-semibold text-gray-600">Apps</th>
                    <th className="px-5 py-3 text-center font-semibold text-gray-600">Active</th>
                    <th className="px-5 py-3 text-right font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-gray-500">
                        No job postings yet
                      </td>
                    </tr>
                  ) : (
                    jobs.map((job) => {
                      const appCount = applications.filter((a) => a.job_posting_id === job.id).length;
                      return (
                        <tr key={job.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                          <td className="px-5 py-3 font-medium text-gray-900">{job.title}</td>
                          <td className="px-5 py-3 text-gray-600">{job.hourly_rate || "—"}</td>
                          <td className="px-5 py-3 text-gray-600 capitalize">{job.location_type}</td>
                          <td className="px-5 py-3 text-gray-600 capitalize">{job.employment_type}</td>
                          <td className="px-5 py-3 text-center">
                            {appCount > 0 ? (
                              <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                {appCount}
                              </span>
                            ) : (
                              <span className="text-gray-400">0</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleActive(job)}
                              className={`h-5 w-9 rounded-full transition-colors cursor-pointer ${
                                job.active ? "bg-green-600" : "bg-gray-300"
                              }`}
                            >
                              <div
                                className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                  job.active ? "translate-x-4" : "translate-x-0.5"
                                }`}
                              />
                            </button>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => startEditJob(job)}
                                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteJob(job.id)}
                                disabled={deletingJob === job.id}
                                className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 cursor-pointer"
                              >
                                {deletingJob === job.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Applications Tab */}
      {activeTab === "applications" && (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Applicant</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Position</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Date</th>
                  <th className="px-5 py-3 text-left font-semibold text-gray-600">Status</th>
                  <th className="px-5 py-3 text-right font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-gray-500">
                      No applications yet
                    </td>
                  </tr>
                ) : (
                  applications.map((app) => (
                    <tr key={app.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{app.full_name}</p>
                        <p className="text-xs text-gray-500">{app.email}</p>
                        {app.phone && <p className="text-xs text-gray-500">{app.phone}</p>}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{app.job_postings?.title || "—"}</td>
                      <td className="px-5 py-3 text-gray-600">{new Date(app.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-3">
                        <div className="relative inline-block">
                          <select
                            value={app.status}
                            onChange={(e) => handleUpdateAppStatus(app.id, e.target.value)}
                            disabled={updatingApp === app.id}
                            className={`appearance-none rounded-full px-3 py-1 pr-7 text-xs font-medium cursor-pointer ${
                              STATUS_STYLES[app.status] || "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {APP_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2" />
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setExpandedApp(expandedApp === app.id ? null : app.id)}
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {app.resume_url && (
                            <a
                              href={app.resume_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg p-1.5 text-blue-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                              title="View resume"
                            >
                              <FileText className="h-4 w-4" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteApp(app.id)}
                            disabled={deletingApp === app.id}
                            className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 cursor-pointer"
                          >
                            {deletingApp === app.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Expanded application details */}
          {expandedApp && (() => {
            const app = applications.find((a) => a.id === expandedApp);
            if (!app) return null;
            return (
              <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">{app.full_name} — Application Details</h3>
                  <button
                    type="button"
                    onClick={() => setExpandedApp(null)}
                    className="text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div>
                    <p className="text-gray-500">Email</p>
                    <p className="text-gray-900">{app.email}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Phone</p>
                    <p className="text-gray-900">{app.phone || "Not provided"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Position</p>
                    <p className="text-gray-900">{app.job_postings?.title || "—"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Applied</p>
                    <p className="text-gray-900">{new Date(app.created_at).toLocaleString()}</p>
                  </div>
                  {app.resume_url && (
                    <div>
                      <p className="text-gray-500">Resume</p>
                      <a
                        href={app.resume_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-600 hover:underline"
                      >
                        View Resume
                      </a>
                    </div>
                  )}
                </div>
                {app.cover_letter && (
                  <div className="mt-3">
                    <p className="text-gray-500 text-sm mb-1">Cover Letter</p>
                    <div className="rounded-lg bg-white border border-gray-200 p-4 text-sm text-gray-700 whitespace-pre-wrap">
                      {app.cover_letter}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
