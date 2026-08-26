/**
 * Shared constants for the Payroll Onboarding module. Consumed by
 * both admin and worker surfaces so status/label semantics stay in
 * one place.
 */

export type PayrollClassification = "w2_employee" | "1099_contractor";
export type PayrollStatus =
  | "not_added"
  | "invite_ready"
  | "invite_sent"
  | "in_progress"
  | "employee_action_required"
  | "admin_review_required"
  | "ready_for_quickbooks"
  | "payroll_active"
  | "update_requested"
  | "inactive";

export const STATUS_LABELS: Record<PayrollStatus, string> = {
  not_added: "Not Added",
  invite_ready: "Invite Ready",
  invite_sent: "Invite Sent",
  in_progress: "In Progress",
  employee_action_required: "Employee Action Required",
  admin_review_required: "Admin Review Required",
  ready_for_quickbooks: "Ready for QuickBooks",
  payroll_active: "Payroll Active",
  update_requested: "Update Requested",
  inactive: "Inactive",
};

export const STATUS_TONES: Record<PayrollStatus, string> = {
  not_added: "bg-gray-100 text-gray-600 ring-gray-200",
  invite_ready: "bg-sky-50 text-sky-700 ring-sky-200",
  invite_sent: "bg-blue-50 text-blue-700 ring-blue-200",
  in_progress: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  employee_action_required: "bg-amber-50 text-amber-700 ring-amber-200",
  admin_review_required: "bg-purple-50 text-purple-700 ring-purple-200",
  ready_for_quickbooks: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  payroll_active: "bg-green-100 text-green-800 ring-green-300",
  update_requested: "bg-orange-50 text-orange-700 ring-orange-200",
  inactive: "bg-gray-100 text-gray-500 line-through ring-gray-200",
};

export const CLASSIFICATION_LABELS: Record<PayrollClassification, string> = {
  w2_employee: "W-2 Employee",
  "1099_contractor": "1099 Independent Contractor",
};

export const PAY_TYPES = [
  { value: "hourly",             label: "Hourly" },
  { value: "salary",             label: "Salary" },
  { value: "commission",         label: "Commission" },
  { value: "hourly_commission",  label: "Hourly + Commission" },
  { value: "salary_commission",  label: "Salary + Commission" },
  { value: "commission_only",    label: "Commission Only" },
] as const;

export const PAY_FREQUENCIES = [
  { value: "weekly",       label: "Weekly" },
  { value: "biweekly",     label: "Bi-weekly" },
  { value: "semimonthly",  label: "Semi-monthly" },
  { value: "monthly",      label: "Monthly" },
] as const;

export const EMPLOYMENT_STATUSES = [
  { value: "full_time",  label: "Full-time" },
  { value: "part_time",  label: "Part-time" },
  { value: "temporary",  label: "Temporary" },
  { value: "other",      label: "Other" },
] as const;

export const FILING_STATUSES = [
  { value: "single", label: "Single or Married Filing Separately" },
  { value: "mfj",    label: "Married Filing Jointly or Qualifying Surviving Spouse" },
  { value: "hoh",    label: "Head of Household" },
] as const;

export const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings",  label: "Savings" },
] as const;

export const TIN_TYPES = [
  { value: "ssn", label: "SSN" },
  { value: "ein", label: "EIN" },
] as const;

export const FEDERAL_TAX_CLASSES = [
  "Individual/sole proprietor",
  "Single-member LLC",
  "C corporation",
  "S corporation",
  "Partnership",
  "Trust/estate",
  "LLC (C corp taxation)",
  "LLC (S corp taxation)",
  "LLC (Partnership taxation)",
  "Other",
] as const;

// The list of legal entities admin can pick from when configuring a
// payroll profile. Kept short + editable — extend when new legal
// entities are added to the business.
export const COMPANY_ENTITIES = [
  "Apex AI Vending LLP",
  "Vending Connector",
] as const;

/** Sensitive field keys stored in payroll_encrypted. */
export const ENCRYPTED_FIELD_KEYS = [
  "ssn",
  "tin",
  "bank.routing",
  "bank.account",
  "w4.additional_withholding_cents",
] as const;
