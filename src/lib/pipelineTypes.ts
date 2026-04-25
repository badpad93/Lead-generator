// ============================================================
// PIPELINE STEPS (with gating configuration)
// ============================================================

export interface PipelineStep {
  id: string;
  pipeline_id: string;
  name: string;
  order_index: number;
  requires_document: boolean;
  requires_signature: boolean;
  requires_payment: boolean;
  requires_admin_approval: boolean;
  payment_amount: number | null;
  payment_description: string | null;
  created_at: string;
  step_documents?: StepDocument[];
}

export interface StepDocument {
  id: string;
  step_id: string;
  name: string;
  file_type: string | null;
  required: boolean;
  created_at: string;
}

// ============================================================
// PIPELINE ITEMS
// ============================================================

export interface PipelineItem {
  id: string;
  pipeline_id: string;
  account_id: string | null;
  employee_id: string | null;
  candidate_id: string | null;
  lead_id: string | null;
  name: string;
  status: "active" | "won" | "lost";
  current_step_id: string | null;
  value: number;
  notes: string | null;
  assigned_to: string | null;
  auto_advance: boolean;
  created_at: string;
  updated_at: string;
}

export interface PipelineItemDocument {
  id: string;
  pipeline_item_id: string;
  step_document_id: string;
  file_url: string;
  file_name: string | null;
  completed: boolean;
  uploaded_at: string;
}

// ============================================================
// E-SIGNATURE DOCUMENTS
// ============================================================

export type EsignProvider = "pandadoc" | "dropbox_sign";

export type EsignStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "waiting_approval"
  | "completed"
  | "declined"
  | "voided"
  | "expired";

export interface EsignDocument {
  id: string;
  pipeline_item_id: string;
  step_id: string;
  candidate_id: string | null;
  provider: EsignProvider;
  external_document_id: string | null;
  template_id: string | null;
  document_name: string;
  recipient_email: string;
  recipient_name: string | null;
  status: EsignStatus;
  signed_pdf_url: string | null;
  sent_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================================
// PIPELINE PAYMENTS
// ============================================================

export type PaymentProvider = "paypal" | "stripe";

export type PaymentStatus =
  | "pending"
  | "created"
  | "approved"
  | "completed"
  | "failed"
  | "refunded"
  | "cancelled";

export interface PipelinePayment {
  id: string;
  pipeline_item_id: string;
  step_id: string;
  candidate_id: string | null;
  provider: PaymentProvider;
  external_order_id: string | null;
  external_payment_id: string | null;
  amount: number;
  currency: string;
  description: string | null;
  status: PaymentStatus;
  payment_url: string | null;
  paid_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================================
// STEP APPROVALS
// ============================================================

export interface StepApproval {
  id: string;
  pipeline_item_id: string;
  step_id: string;
  approved_by: string | null;
  approved: boolean;
  notes: string | null;
  approved_at: string | null;
  created_at: string;
}

// ============================================================
// GATING STATUS (runtime, not stored)
// ============================================================

export interface GatingRequirement {
  required: boolean;
  completed: boolean;
}

export interface GatingRequirementWithPending extends GatingRequirement {
  pending: boolean;
}

export interface GatingStatus {
  canAdvance: boolean;
  requirements: {
    documents: GatingRequirement;
    signature: GatingRequirementWithPending;
    payment: GatingRequirementWithPending;
    adminApproval: GatingRequirement;
  };
  blockers: string[];
}

// ============================================================
// CANDIDATES (existing table, types for reference)
// ============================================================

export type CandidateRoleType = "BDP" | "MARKET_LEADER";

export type CandidateStatus =
  | "application"
  | "interview"
  | "pending_admin_review_1"
  | "welcome_docs_sent"
  | "pending_admin_review_2"
  | "completed"
  | "assigned_to_training"
  | "terminated";

export interface Candidate {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role_type: CandidateRoleType;
  application_date: string | null;
  interview_date: string | null;
  interview_time: string | null;
  status: CandidateStatus;
  current_pipeline_id: string | null;
  current_step_id: string | null;
  onboarding_completed_at: string | null;
  assigned_training_pipeline_id: string | null;
  terminated_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// PIPELINES
// ============================================================

export type PipelineType = "hiring" | "sales";

export interface Pipeline {
  id: string;
  name: string;
  type: PipelineType;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  pipeline_steps?: PipelineStep[];
}
