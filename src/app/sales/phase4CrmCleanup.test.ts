import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deriveFlowState } from "@/lib/salesOrderNextAction";

/*
 * Phase 4 — CRM quote/order/agreement action cleanup.
 *
 * There is no DOM test environment in this repo, so the button-level
 * assertions are source-level regression guards: they lock the specific
 * removals/consolidations and prove the backend endpoints were NOT
 * deleted. The primary-CTA-by-state logic is pure and asserted directly.
 */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

const ORDER_PAGE = "src/app/sales/orders/[id]/page.tsx";
const PANEL = "src/app/sales/orders/[id]/SourcedLocationsPanel.tsx";
const AGREEMENT_PAGE = "src/app/sales/agreements/[id]/page.tsx";

function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

describe("Phase 4 — primary CTA by document state (pure logic)", () => {
  it("a draft quote with items offers Send Quote (send_quote)", () => {
    const s = deriveFlowState({
      document_type: "quote",
      order_status: "draft",
      order_items: [{ item_type: "machine_sale" }],
    });
    expect(s.action?.verb).toBe("send_quote");
  });

  it("a sent quote offers Process Order (process_order)", () => {
    const s = deriveFlowState({
      document_type: "quote",
      order_status: "quote_sent",
      order_items: [{ item_type: "machine_sale" }],
    });
    expect(s.action?.verb).toBe("process_order");
  });

  it("once awaiting the customer, there is no competing CTA", () => {
    const s = deriveFlowState({
      document_type: "order",
      order_status: "awaiting_payment",
      order_items: [{ item_type: "machine_sale" }],
    });
    expect(s.action).toBeFalsy();
  });
});

describe("Phase 4 — remaining-balance invoice has ONE control", () => {
  it("the order page no longer invokes /send-remaining-balance", () => {
    const src = read(ORDER_PAGE);
    expect(src).not.toContain("send-remaining-balance");
    expect(src).not.toContain("handleSendRemainingBalance");
    expect(src).not.toContain("Send Remaining Balance Invoice");
  });

  it("the Sourced Locations panel remains the single remaining-balance entry point", () => {
    const src = read(PANEL);
    expect(count(src, "locations/invoice-remaining")).toBe(1);
    expect(src).toContain("Invoice remaining balance");
  });
});

describe("Phase 4 — receipt backend preserved", () => {
  it("the order page still sends receipts (send-receipt) after the UI cleanup", () => {
    const src = read(ORDER_PAGE);
    expect(src).toContain("send-receipt");
    // Custom receipt remains a distinct control.
    expect(src).toContain("Send Custom Receipt");
  });
});

describe("Phase 4 — agreement destructive actions behind an overflow menu", () => {
  it("the agreement page uses the OverflowMenu for rare/destructive actions", () => {
    const src = read(AGREEMENT_PAGE);
    expect(src).toContain('from "@/app/components/OverflowMenu"');
    expect(src).toContain("<OverflowMenu");
    // Destructive handlers are still wired (moved, not deleted).
    expect(src).toContain("handleCancel");
    expect(src).toContain("handleDelete");
  });

  it("the duplicate header toolbar was removed (single action home)", () => {
    const src = read(AGREEMENT_PAGE);
    expect(src).toContain("duplicate header toolbar");
    // "Save Changes" (the Actions-card primary) appears once, not duplicated
    // by a second header "Save" cluster.
    expect(count(src, "Save Changes")).toBe(1);
  });
});

describe("Phase 4/5A — canonical endpoints preserved", () => {
  it("receipt + canonical remaining-balance endpoints still exist on disk", () => {
    for (const rel of [
      "src/app/api/sales/orders/[id]/send-receipt/route.ts",
      "src/app/api/sales/orders/[id]/locations/invoice-remaining/route.ts",
    ]) {
      expect(existsSync(ROOT + rel), rel).toBe(true);
    }
  });

  it("the orphaned send-remaining-balance route was removed in Phase 5A", () => {
    // Phase 4 removed its only UI caller; Phase 5A removed the now-dead
    // route. invoice-remaining (above) is the single remaining-balance path.
    expect(
      existsSync(ROOT + "src/app/api/sales/orders/[id]/send-remaining-balance/route.ts"),
    ).toBe(false);
  });
});
