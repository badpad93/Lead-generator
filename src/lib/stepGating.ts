import { supabaseAdmin } from "./supabaseAdmin";

export interface GatingStatus {
  canAdvance: boolean;
  requirements: {
    documents: { required: boolean; completed: boolean };
    signature: { required: boolean; completed: boolean; pending: boolean };
    payment: { required: boolean; completed: boolean; pending: boolean };
    adminApproval: { required: boolean; completed: boolean };
  };
  blockers: string[];
}

export async function checkStepGating(
  pipelineItemId: string,
  stepId: string
): Promise<GatingStatus> {
  const blockers: string[] = [];

  const { data: step } = await supabaseAdmin
    .from("pipeline_steps")
    .select("*, step_documents(*)")
    .eq("id", stepId)
    .single();

  if (!step) {
    return {
      canAdvance: false,
      requirements: {
        documents: { required: false, completed: false },
        signature: { required: false, completed: false, pending: false },
        payment: { required: false, completed: false, pending: false },
        adminApproval: { required: false, completed: false },
      },
      blockers: ["Step not found"],
    };
  }

  // 1. Document requirements (existing logic)
  let docsRequired = false;
  let docsCompleted = true;
  if (step.requires_document) {
    const requiredDocs = (step.step_documents || []).filter(
      (d: { required: boolean }) => d.required
    );
    docsRequired = requiredDocs.length > 0;
    if (docsRequired) {
      const { data: uploadedDocs } = await supabaseAdmin
        .from("pipeline_item_documents")
        .select("step_document_id, completed")
        .eq("pipeline_item_id", pipelineItemId);

      const completedSet = new Set(
        (uploadedDocs || [])
          .filter((d: { completed: boolean }) => d.completed)
          .map((d: { step_document_id: string }) => d.step_document_id)
      );

      const missing = requiredDocs.filter(
        (d: { id: string }) => !completedSet.has(d.id)
      );
      if (missing.length > 0) {
        docsCompleted = false;
        blockers.push(
          `${missing.length} required document(s) not uploaded`
        );
      }
    }
  }

  // 2. E-signature requirements
  const sigRequired = step.requires_signature === true;
  let sigCompleted = true;
  let sigPending = false;
  if (sigRequired) {
    const { data: esignDocs } = await supabaseAdmin
      .from("esign_documents")
      .select("status")
      .eq("pipeline_item_id", pipelineItemId)
      .eq("step_id", stepId);

    if (!esignDocs || esignDocs.length === 0) {
      sigCompleted = false;
      blockers.push("E-signature document not sent yet");
    } else {
      const allCompleted = esignDocs.every(
        (d: { status: string }) => d.status === "completed"
      );
      const anyPending = esignDocs.some(
        (d: { status: string }) =>
          d.status === "sent" || d.status === "viewed"
      );
      if (!allCompleted) {
        sigCompleted = false;
        sigPending = anyPending;
        blockers.push(
          anyPending
            ? "Waiting for e-signature completion"
            : "E-signature not completed"
        );
      }
    }
  }

  // 3. Payment requirements
  const payRequired = step.requires_payment === true;
  let payCompleted = true;
  let payPending = false;
  if (payRequired) {
    const { data: payments } = await supabaseAdmin
      .from("pipeline_payments")
      .select("status")
      .eq("pipeline_item_id", pipelineItemId)
      .eq("step_id", stepId);

    if (!payments || payments.length === 0) {
      payCompleted = false;
      blockers.push("Payment not initiated");
    } else {
      const anyCompleted = payments.some(
        (p: { status: string }) => p.status === "completed"
      );
      const anyCreated = payments.some(
        (p: { status: string }) =>
          p.status === "created" || p.status === "approved"
      );
      if (!anyCompleted) {
        payCompleted = false;
        payPending = anyCreated;
        blockers.push(
          anyCreated
            ? "Waiting for payment completion"
            : "Payment not completed"
        );
      }
    }
  }

  // 4. Admin approval requirements
  const approvalRequired = step.requires_admin_approval === true;
  let approvalCompleted = true;
  if (approvalRequired) {
    const { data: approval } = await supabaseAdmin
      .from("step_approvals")
      .select("approved")
      .eq("pipeline_item_id", pipelineItemId)
      .eq("step_id", stepId)
      .eq("approved", true)
      .maybeSingle();

    if (!approval) {
      approvalCompleted = false;
      blockers.push("Admin approval required");
    }
  }

  return {
    canAdvance: blockers.length === 0,
    requirements: {
      documents: { required: docsRequired, completed: docsCompleted },
      signature: {
        required: sigRequired,
        completed: sigCompleted,
        pending: sigPending,
      },
      payment: {
        required: payRequired,
        completed: payCompleted,
        pending: payPending,
      },
      adminApproval: {
        required: approvalRequired,
        completed: approvalCompleted,
      },
    },
    blockers,
  };
}
