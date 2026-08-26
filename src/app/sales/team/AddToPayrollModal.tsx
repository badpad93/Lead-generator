"use client";

/**
 * "Add to Payroll" modal opened from /sales/team.
 *
 * Admin picks classification (W-2 or 1099), enters employment /
 * comp info, and fires POST /api/admin/payroll/profiles which
 * creates the payroll_profiles row + issues a token + sends the
 * secure invitation email in one shot.
 *
 * WORKER info (name / SSN / address / tax / bank) is deliberately
 * NOT collected here — that flows through the /payroll/{token}
 * portal so the worker submits their own sensitive data over the
 * secure path.
 */

import { useState, useEffect } from "react";
import { X, Loader2, Send, CheckCircle2, AlertCircle, Coins } from "lucide-react";
import {
  CLASSIFICATION_LABELS,
  COMPANY_ENTITIES,
  EMPLOYMENT_STATUSES,
  PAY_FREQUENCIES,
  PAY_TYPES,
  type PayrollClassification,
} from "@/lib/payroll/constants";

interface Props {
  memberId: string;
  memberName: string;
  memberEmail: string;
  token: string;
  onClose: () => void;
  onSent?: () => void;
}

export default function AddToPayrollModal({ memberId, memberName, memberEmail, token, onClose, onSent }: Props) {
  const [classification, setClassification] = useState<PayrollClassification>("w2_employee");
  const [companyEntity, setCompanyEntity] = useState<string>(COMPANY_ENTITIES[0]);
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("full_time");
  const [hireDate, setHireDate] = useState("");
  const [payType, setPayType] = useState("hourly");
  const [payFrequency, setPayFrequency] = useState("biweekly");
  const [hourlyRate, setHourlyRate] = useState("");
  const [annualSalary, setAnnualSalary] = useState("");
  const [commissionNotes, setCommissionNotes] = useState("");
  const [expectedHours, setExpectedHours] = useState("");
  const [overtimeEligible, setOvertimeEligible] = useState(false);
  const [compensationNotes, setCompensationNotes] = useState("");
  const [recipient, setRecipient] = useState(memberEmail);
  const [workState, setWorkState] = useState("");
  const [phase, setPhase] = useState<"edit" | "sending" | "done">("edit");
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  useEffect(() => { setRecipient(memberEmail); }, [memberEmail]);

  const showHourly = payType === "hourly" || payType === "hourly_commission";
  const showSalary = payType === "salary" || payType === "salary_commission";
  const showCommission = payType === "commission" || payType === "hourly_commission" || payType === "salary_commission" || payType === "commission_only";

  async function send() {
    setPhase("sending");
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        team_member_id: memberId,
        classification,
        company_entity: companyEntity,
        job_title: jobTitle || null,
        department: department || null,
        work_location: workLocation || null,
        employment_status: employmentStatus,
        hire_date: hireDate || null,
        pay_type: payType,
        pay_frequency: payFrequency,
        overtime_eligible: overtimeEligible,
        expected_hours_per_week: expectedHours ? Number(expectedHours) : null,
        commission_notes: showCommission ? (commissionNotes || null) : null,
        compensation_notes: compensationNotes || null,
        recipient_email: recipient,
        work_state: workState || null,
      };
      if (showHourly && hourlyRate) payload.hourly_rate_cents = Math.round(Number(hourlyRate) * 100);
      if (showSalary && annualSalary) payload.annual_salary_cents = Math.round(Number(annualSalary) * 100);

      const res = await fetch("/api/admin/payroll/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      setOkMessage(`Payroll invitation sent to ${memberName} at ${recipient}.`);
      setPhase("done");
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
      setPhase("edit");
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/50 p-4 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="mt-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl mb-10">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-green-primary" />
              <h2 className="text-lg font-semibold text-gray-900">Add to Payroll</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Team Member: <span className="font-medium text-gray-800">{memberName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === "sending"}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {phase === "edit" && (
          <div className="p-6 space-y-5">
            {/* Worker classification */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-amber-800 mb-2">
                Worker Classification (admin decides — worker cannot change)
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(["w2_employee", "1099_contractor"] as PayrollClassification[]).map((v) => (
                  <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${classification === v ? "border-amber-600 bg-white ring-2 ring-amber-500" : "border-amber-200 bg-white/70 hover:bg-white"}`}>
                    <input type="radio" name="classification" value={v} checked={classification === v} onChange={() => setClassification(v)} />
                    <span className="font-medium text-gray-800">{CLASSIFICATION_LABELS[v]}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Company + recipient email */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Company / Payroll Entity</span>
                <select value={companyEntity} onChange={(e) => setCompanyEntity(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  {COMPANY_ENTITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Send To</span>
                <input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </label>
            </div>

            {/* Employment */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField label="Job Title"      value={jobTitle}      onChange={setJobTitle} />
              <TextField label="Department"     value={department}    onChange={setDepartment} />
              <TextField label="Work Location"  value={workLocation}  onChange={setWorkLocation} />
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Employment Status</span>
                <select value={employmentStatus} onChange={(e) => setEmploymentStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  {EMPLOYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Hire / Start Date</span>
                <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </label>
              <TextField label="Work State (2-letter)" value={workState} onChange={setWorkState} placeholder="e.g. SC" />
            </div>

            {/* Compensation */}
            <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Compensation</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Pay Type</span>
                  <select value={payType} onChange={(e) => setPayType(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    {PAY_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Pay Frequency</span>
                  <select value={payFrequency} onChange={(e) => setPayFrequency(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    {PAY_FREQUENCIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>
                {showHourly && (
                  <TextField label="Hourly Rate ($/hr)" value={hourlyRate} onChange={setHourlyRate} type="number" placeholder="e.g. 25.00" />
                )}
                {showSalary && (
                  <TextField label="Annual Salary ($)" value={annualSalary} onChange={setAnnualSalary} type="number" placeholder="e.g. 65000" />
                )}
                <TextField label="Expected Hours / Week" value={expectedHours} onChange={setExpectedHours} type="number" placeholder="e.g. 40" />
                <label className="flex items-center gap-2 mt-6">
                  <input type="checkbox" checked={overtimeEligible} onChange={(e) => setOvertimeEligible(e.target.checked)} />
                  <span className="text-sm text-gray-700">Overtime eligible</span>
                </label>
              </div>
              {showCommission && (
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Commission structure / notes</span>
                  <textarea rows={2} value={commissionNotes} onChange={(e) => setCommissionNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
              )}
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Additional compensation notes</span>
                <textarea rows={2} value={compensationNotes} onChange={(e) => setCompensationNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </label>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
              <button type="button" onClick={send} className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary px-4 py-2 text-sm font-semibold text-white hover:bg-green-hover">
                <Send className="h-4 w-4" />
                Send Payroll Setup
              </button>
            </div>
          </div>
        )}

        {phase === "sending" && (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-sm text-gray-600">
            <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
            Creating payroll profile and sending invitation…
          </div>
        )}

        {phase === "done" && (
          <div className="p-6 space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <p className="text-sm font-semibold text-emerald-800">{okMessage}</p>
              <p className="text-xs text-emerald-700">
                They&apos;ll receive a secure link to enter their tax, address, and banking details.
              </p>
            </div>
            <div className="flex items-center justify-end">
              <button type="button" onClick={onClose} className="rounded-lg bg-green-primary px-4 py-2 text-sm font-semibold text-white hover:bg-green-hover">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
      />
    </label>
  );
}
