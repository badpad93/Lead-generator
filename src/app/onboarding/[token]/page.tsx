"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useParams } from "next/navigation";
import { Loader2, CheckCircle2, FileText, Upload, Download, AlertCircle } from "lucide-react";

interface RequiredDoc {
  assignment_id: string;
  template_id: string;
  name: string;
  file_name: string;
  file_path: string;
  required: boolean;
  uploaded: boolean;
  uploaded_doc: {
    id: string;
    file_name: string;
    file_url: string;
    created_at: string;
  } | null;
}

interface PortalData {
  token: string;
  status: string;
  step_key: string;
  candidate_name: string;
  required_documents: RequiredDoc[];
  submitted: boolean;
}

const STEP_TITLES: Record<string, string> = {
  interview: "Interview Documents",
  welcome_docs: "Welcome & Onboarding Documents",
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  interview: "Please review, complete, and upload the following documents to proceed with your interview process.",
  welcome_docs: "Congratulations on moving forward! Please complete and upload these documents to finalize your onboarding.",
};

function PortalContent() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingTemplateRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/onboarding/candidate-portal/${token}`);
    if (res.ok) {
      setData(await res.json());
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error || "Portal not found");
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleUpload(templateId: string, file: File) {
    setUploading(templateId);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("document_template_id", templateId);

    try {
      const res = await fetch(`/api/onboarding/candidate-portal/${token}/upload`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const result = await res.json();
        if (result.advanced) {
          setData((prev) => prev ? { ...prev, submitted: true } : prev);
        }
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        setUploadError(err.error || "Upload failed");
      }
    } catch {
      setUploadError("Network error — please try again");
    } finally {
      setUploading(null);
    }
  }

  function handleFileSelect(templateId: string) {
    pendingTemplateRef.current = templateId;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const templateId = pendingTemplateRef.current;
    if (file && templateId) {
      handleUpload(templateId, file);
    }
    pendingTemplateRef.current = null;
  }

  async function handleDownloadTemplate(filePath: string, fileName: string) {
    const res = await fetch(`/api/onboarding/candidate-portal/${token}/download?file_path=${encodeURIComponent(filePath)}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Link Not Found</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (data.submitted) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-green-600 mb-1">Vending Connector</h1>
            <p className="text-sm text-gray-500">Onboarding Portal</p>
          </div>
          <div className="rounded-2xl border border-green-200 bg-green-50 p-8">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600 mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">All Documents Submitted</h2>
            <p className="text-sm text-gray-600">
              Thank you, {data.candidate_name}! All required documents have been received.
              {data.step_key === "interview"
                ? " You'll receive your next set of onboarding documents shortly."
                : " Your onboarding is now complete."}
            </p>
          </div>
          <p className="mt-8 text-xs text-gray-400">Vending Connector — vendingconnector.com</p>
        </div>
      </div>
    );
  }

  const allUploaded = data.required_documents.filter((d) => d.required).every((d) => d.uploaded);
  const uploadedCount = data.required_documents.filter((d) => d.uploaded).length;
  const totalCount = data.required_documents.length;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.heif,.webp"
        onChange={onFileInputChange}
        className="hidden"
      />
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-green-600 mb-1">Vending Connector</h1>
          <p className="text-sm text-gray-500">Onboarding Portal</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Welcome</p>
            <p className="text-lg font-bold text-gray-900">{data.candidate_name}</p>
          </div>

          {/* Step Info */}
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              {STEP_TITLES[data.step_key] || data.step_key}
            </h2>
            <p className="text-sm text-gray-500">
              {STEP_DESCRIPTIONS[data.step_key] || "Please complete the following documents."}
            </p>
          </div>

          {/* Progress */}
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500">Progress</span>
              <span className="text-xs font-medium text-gray-700">{uploadedCount} of {totalCount} uploaded</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-green-500 transition-all"
                style={{ width: totalCount > 0 ? `${(uploadedCount / totalCount) * 100}%` : "0%" }}
              />
            </div>
          </div>

          {uploadError && (
            <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {uploadError}
            </div>
          )}

          {/* Document List */}
          <div className="divide-y divide-gray-100">
            {data.required_documents.map((doc) => (
              <div key={doc.template_id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {doc.uploaded ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      )}
                      <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                      {doc.required && !doc.uploaded && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">Required</span>
                      )}
                    </div>
                    {doc.uploaded && doc.uploaded_doc && (
                      <p className="mt-1 ml-6 text-xs text-green-600">
                        Uploaded: {doc.uploaded_doc.file_name}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleDownloadTemplate(doc.file_path, doc.file_name)}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
                    >
                      <Download className="h-3 w-3" />
                      Template
                    </button>
                    <button
                      onClick={() => handleFileSelect(doc.template_id)}
                      disabled={uploading === doc.template_id}
                      className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${
                        doc.uploaded
                          ? "border border-green-200 text-green-700 hover:bg-green-50"
                          : "bg-green-600 text-white hover:bg-green-700"
                      } disabled:opacity-50`}
                    >
                      {uploading === doc.template_id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Upload className="h-3 w-3" />
                      )}
                      {doc.uploaded ? "Replace" : "Upload"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Completion Banner */}
          {allUploaded && (
            <div className="px-6 py-5 bg-green-50 border-t border-green-200">
              <div className="flex items-center gap-2 justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <p className="text-sm font-medium text-green-800">
                  All documents submitted — your application is moving forward!
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">Vending Connector — vendingconnector.com</p>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPortalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    }>
      <PortalContent />
    </Suspense>
  );
}
