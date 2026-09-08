import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assessOrderDeletable,
  deleteBlockMessage,
  PROTECTED_AGREEMENT_STATUSES,
  PROTECTED_INVOICE_STATUSES,
} from "./deleteGuard";

/*
 * Phase 5C-a9 — hard-delete safety for sales_orders. The deletion decision
 * is pure and unit-tested directly; the DELETE route wiring is asserted as
 * a source-level regression guard (no DB in this env).
 */

/** The exact state Order #108 was in when it was hard-deleted: an invoiced
 *  order (Invoice 779 sent), unpaid, sitting in a draft workflow stage with
 *  a cancelled old agreement + an unsent replacement draft. */
const ORDER_108 = {
  orderStatus: "draft",
  invoiceStatus: "sent",
  paymentStatus: "unpaid",
  financialSpineInvoiceId: null,
  hasCanonicalInvoiceRow: false,
  agreementStatuses: ["cancelled", "draft"],
};

describe("assessOrderDeletable — commercial history blocks a hard delete", () => {
  it("BLOCKS the #108-shaped order (invoice already sent)", () => {
    const r = assessOrderDeletable(ORDER_108);
    expect(r.deletable).toBe(false);
    expect(r.reason).toBe("invoice_sent");
  });

  it("blocks a paid invoice", () => {
    expect(assessOrderDeletable({ invoiceStatus: "paid" }).deletable).toBe(false);
  });

  it("blocks a financial-spine link even if local invoice_status is stale", () => {
    const r = assessOrderDeletable({
      invoiceStatus: "not_sent",
      financialSpineInvoiceId: "inv-779",
    });
    expect(r.deletable).toBe(false);
    expect(r.reason).toBe("financial_spine_linked");
  });

  it("blocks when a canonical invoices row exists", () => {
    const r = assessOrderDeletable({ invoiceStatus: "not_sent", hasCanonicalInvoiceRow: true });
    expect(r.deletable).toBe(false);
    expect(r.reason).toBe("invoice_row_exists");
  });

  it("blocks when any linked agreement is in a protected status", () => {
    for (const s of PROTECTED_AGREEMENT_STATUSES) {
      const r = assessOrderDeletable({
        orderStatus: "draft",
        invoiceStatus: "not_sent",
        paymentStatus: "unpaid",
        agreementStatuses: [s],
      });
      expect(r.deletable, s).toBe(false);
      expect(r.reason, s).toBe(`agreement_${s}`);
    }
  });

  it("specifically blocks an order whose only agreement is a viewed one", () => {
    expect(
      assessOrderDeletable({
        orderStatus: "draft",
        invoiceStatus: "not_sent",
        agreementStatuses: ["viewed"],
      }).deletable,
    ).toBe(false);
  });

  it("specifically blocks an order whose only agreement is cancelled", () => {
    expect(
      assessOrderDeletable({
        orderStatus: "draft",
        invoiceStatus: "not_sent",
        agreementStatuses: ["cancelled"],
      }).deletable,
    ).toBe(false);
  });

  it("blocks a non-unpaid payment status", () => {
    const r = assessOrderDeletable({
      orderStatus: "draft",
      invoiceStatus: "not_sent",
      paymentStatus: "partially_paid",
    });
    expect(r.deletable).toBe(false);
    expect(r.reason).toBe("payment_partially_paid");
  });

  it("blocks any order status past a disposable draft", () => {
    const r = assessOrderDeletable({ orderStatus: "awaiting_payment", invoiceStatus: "not_sent" });
    expect(r.deletable).toBe(false);
    expect(r.reason).toBe("order_status_awaiting_payment");
  });
});

describe("assessOrderDeletable — a disposable draft with no history stays deletable", () => {
  it("allows a pure draft: no invoice, no payment, only a draft agreement", () => {
    const r = assessOrderDeletable({
      orderStatus: "draft",
      invoiceStatus: "not_sent",
      paymentStatus: "unpaid",
      financialSpineInvoiceId: null,
      hasCanonicalInvoiceRow: false,
      agreementStatuses: ["draft"],
    });
    expect(r.deletable).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it("allows a bare draft with no agreements at all", () => {
    expect(assessOrderDeletable({ orderStatus: "draft" }).deletable).toBe(true);
  });

  it("allows an empty-evidence order (nothing known blocks it)", () => {
    expect(assessOrderDeletable({}).deletable).toBe(true);
  });
});

describe("constants", () => {
  it("protected invoice statuses are exactly sent + paid", () => {
    expect([...PROTECTED_INVOICE_STATUSES].sort()).toEqual(["paid", "sent"]);
  });
  it("protected agreement statuses cover the whole seen/permanent window", () => {
    expect([...PROTECTED_AGREEMENT_STATUSES].sort()).toEqual(
      ["cancelled", "countersigned", "executed", "partially_signed", "sent", "signed", "viewed"],
    );
  });
  it("the block message names the reason", () => {
    expect(deleteBlockMessage("invoice_sent")).toContain("invoice_sent");
    expect(deleteBlockMessage("invoice_sent")).toContain("cannot be deleted");
  });
});

/* ---- source-level guard: the DELETE route enforces the assessment ---- */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");
const DELETE_ROUTE = "src/app/api/sales/orders/[id]/route.ts";

describe("DELETE /api/sales/orders/[id] — enforces the guard before deleting", () => {
  const src = read(DELETE_ROUTE);

  it("calls the pure guard and returns 409 with a reason on a block", () => {
    expect(src).toContain("assessOrderDeletable");
    expect(src).toContain("deleteBlockMessage");
    expect(src).toContain("status: 409");
    expect(src).toContain("reason: assessment.reason");
  });

  it("gathers invoice/agreement evidence BEFORE any delete call", () => {
    const guardIdx = src.indexOf("assessOrderDeletable");
    const deleteIdx = src.indexOf('.from("sales_orders").delete()');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(-1);
    // The assessment must run before the destructive delete.
    expect(guardIdx).toBeLessThan(deleteIdx);
  });

  it("still requires an elevated role", () => {
    expect(src).toContain("isElevatedRole(user.role)");
  });

  it("never deletes order_items or purchase_agreements from the route itself", () => {
    // Cascades are the DB's job; a rejected delete must touch nothing. The
    // route only ever deletes sales_documents (pre-clean) + sales_orders.
    expect(src).not.toContain('from("order_items").delete');
    expect(src).not.toContain('from("purchase_agreements").delete');
    expect(src).not.toContain('from("order_activity_log").delete');
  });
});
