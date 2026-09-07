/**
 * Canonical purchase-agreement CONTENT — the single source of the
 * substantive legal language for the machine-purchase agreement.
 *
 * Phase 2 unified structure (which sections apply, their numbering, and
 * initials keys) in sections.ts. Phase 2.5 found the *language* was still
 * authored independently in three places — the customer signing page,
 * the executed PDF, and the CRM preview — so a customer could sign one
 * set of terms and receive a PDF with materially different terms
 * (governing law, risk of loss, cancellation, insurance, …).
 *
 * The customer signing page (src/app/sign/[token]/page.tsx) is the
 * canonical agreement — it is the text actually presented to and signed
 * by the customer. Its wording is transcribed here VERBATIM (HTML
 * entities decoded, dynamic values and section numbers parameterized,
 * and the two previously-broken plural cross-references bound to stable
 * section ids). All three renderers now render FROM this module, so the
 * language can never diverge again.
 *
 *   sections.ts  -> which sections apply, ordering, numbering, initials
 *   clauses.ts   -> the actual canonical agreement language  (this file)
 *   renderers    -> presentation only (React for signing/preview, pdf-lib
 *                   for the PDF); they author no contract terms
 *
 * Commercial figures are NOT computed here (Phase 1 owns pricing). This
 * module reads the authoritative agreement values and formats them.
 */

import {
  resolveAgreementSections,
  createSectionNumberer,
  type AgreementSectionSource,
  type ResolvedSections,
} from "./sections";

/** Bump when the substantive language changes. Stamped onto the
 *  agreement activity log at send/sign so the version a customer agreed
 *  to is traceable. */
export const CLAUSES_VERSION = "2.6.0";

/* ------------------------------------------------------------------ */
/*  Block model — medium-neutral so React and pdf-lib render the same  */
/* ------------------------------------------------------------------ */

/** A data table embedded in a clause. Renderers draw it from the same
 *  agreement values; the prose around it comes from this module. */
export type ClauseTableKey =
  | "equipment"
  | "freight"
  | "location"
  | "storage"
  | "payment"
  | "line_items";

export type ClauseBlock =
  | { kind: "p"; label?: string; text: string; caps?: boolean }
  | { kind: "table"; table: ClauseTableKey };

export interface NumberedClause {
  id: string;
  /** Stable section id (drives initials for the sections.ts union ids);
   *  null for schedules, which use their own initialsKey. */
  sectionId?: string | null;
  title: string;
  displayNumber: number;
  requiresInitials: boolean;
  /** Stored initials key for a schedule (schedule_a/b/c); sections use
   *  their sections.ts initials key via requiresInitials. */
  initialsKey?: string;
  isSchedule: boolean;
  blocks: ClauseBlock[];
}

/* ------------------------------------------------------------------ */
/*  Values                                                            */
/* ------------------------------------------------------------------ */

export interface ClauseValues {
  model: string;
  qty: number;
  unitPrice: string;
  subtotal: string;
  freightPerMachine: string;
  freightTotal: string;
  locations: number;
  locationFee: string;
  maxLocationValue: string;
  locationTimeline: number;
  locationRejection: string;
  locationPayTerms: string;
  storageFee: string;
  freeStorageMonths: number;
  totalDue: string;
  governingState: string;
  venueState: string;
  paymentMethodNotes: string;
  depositOnly: boolean;
  hasStorageFee: boolean;
  locationDeposit: string;
  locationBalance: string;
  machineNotes: string;
  shippingNotes: string;
}

function money(n: unknown): string {
  const v = Number(n);
  return `$${(Number.isFinite(v) ? v : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function num(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Build the parameterization from a purchase_agreements row (or a
 * form/preview shim with the same column names). Every renderer calls
 * this so the values in the prose are derived identically.
 */
export function buildClauseValues(ag: Record<string, unknown>): ClauseValues {
  const maxLoc = num(ag.max_location_service_value);
  const deposit = Math.min(num(ag.location_services_deposit_amount), maxLoc);
  const balance = Math.max(0, maxLoc - deposit);
  return {
    model: String(ag.machine_model || "VendEra AI Smart Vending Machine"),
    qty: num(ag.machine_quantity) || 1,
    unitPrice: money(ag.machine_unit_price),
    subtotal: money(ag.equipment_subtotal),
    freightPerMachine: money(ag.freight_per_machine),
    freightTotal: money(ag.freight_total),
    locations: num(ag.locations_purchased),
    locationFee: money(ag.location_fee_per_secured),
    maxLocationValue: money(ag.max_location_service_value),
    locationTimeline: num(ag.location_service_timeline_days) || 180,
    locationRejection:
      String(ag.location_rejection_allowance || "") ||
      "Greater of 10 locations total or 1 per purchased machine",
    locationPayTerms:
      String(ag.location_payment_terms || "") ||
      "Due within 5 business days of invoice",
    storageFee: money(ag.storage_fee_per_machine_month),
    freeStorageMonths: num(ag.free_storage_months) || 0,
    totalDue: money(ag.total_due_prior_to_procurement),
    governingState: String(ag.governing_state || "") || "Texas",
    venueState: String(ag.venue_state || "") || "Texas",
    paymentMethodNotes: String(ag.payment_method_notes || ""),
    depositOnly: ag.location_services_deposit_only === true,
    hasStorageFee: num(ag.storage_fee_per_machine_month) > 0,
    locationDeposit: money(deposit),
    locationBalance: money(balance),
    machineNotes: String(ag.machine_notes || ""),
    shippingNotes: String(ag.shipping_notes || ""),
  };
}

/* ------------------------------------------------------------------ */
/*  Canonical clause definitions                                      */
/* ------------------------------------------------------------------ */

interface ClauseCtx {
  v: ClauseValues;
  sec: ResolvedSections;
  /** Current display number of a section, for legal cross-references. */
  sectionNo: (id: string) => number;
}

interface ClauseDef {
  id: string;
  sectionId?: string | null;
  title: string;
  requiresInitials?: boolean;
  initialsKey?: string;
  isSchedule?: boolean;
  applies: (ctx: ClauseCtx) => boolean;
  blocks: (ctx: ClauseCtx) => ClauseBlock[];
}

const p = (label: string, text: string, caps = false): ClauseBlock => ({
  kind: "p",
  label,
  text,
  caps,
});
const plain = (text: string, caps = false): ClauseBlock => ({ kind: "p", text, caps });
const table = (t: ClauseTableKey): ClauseBlock => ({ kind: "table", table: t });

/**
 * Rewrite the section component of any "N.M" subsection label to the
 * section's resolved display number, keeping the authored subsection ordinal
 * (M). e.g. a "9.1 Warranty Coverage." block in a section resolved to number
 * 8 becomes "8.1 Warranty Coverage.". Labels without a leading "N.M" prefix
 * (defined terms like `"Equipment"`, or unlabeled paragraphs) are untouched.
 */
function renumberSubsections(blocks: ClauseBlock[], sectionNumber: number): ClauseBlock[] {
  return blocks.map((b) => {
    if (b.kind === "p" && b.label) {
      const relabeled = b.label.replace(/^(\d+)\.(\d+)/, `${sectionNumber}.$2`);
      return { ...b, label: relabeled };
    }
    return b;
  });
}

/** "Sections 3, 4, and 5" from stable ids, resolved to display numbers. */
function sectionList(ctx: ClauseCtx, ids: string[]): string {
  const nums = ids
    .map((id) => ctx.sectionNo(id))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (nums.length === 0) return "the surviving Sections";
  if (nums.length === 1) return `Section ${nums[0]}`;
  const head = nums.slice(0, -1).join(", ");
  return `Sections ${head}, and ${nums[nums.length - 1]}`;
}

/**
 * The ordered canonical spine. Order matches the customer signing page
 * (the canonical document). Conditional sections use `applies`.
 */
const CLAUSES: ClauseDef[] = [
  {
    id: "recitals",
    title: "Recitals",
    applies: () => true,
    blocks: ({ sec }) => {
      const blocks: ClauseBlock[] = [
        plain(
          "WHEREAS, Seller is in the business of selling smart vending machines and providing location placement, shipping, logistics, and storage services;",
        ),
      ];
      if (sec.equipment && sec.location) {
        blocks.push(
          plain(
            "WHEREAS, Buyer desires to purchase one or more vending machines and engage Seller for location placement services;",
          ),
        );
      } else if (sec.equipment && !sec.location) {
        blocks.push(
          plain("WHEREAS, Buyer desires to purchase one or more vending machines from Seller;"),
        );
      } else if (!sec.equipment && sec.location) {
        blocks.push(
          plain(
            "WHEREAS, Buyer desires to engage Seller to provide location placement services for vending machines;",
          ),
        );
      }
      blocks.push(
        plain(
          "NOW, THEREFORE, in consideration of the mutual covenants and agreements set forth herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:",
        ),
      );
      return blocks;
    },
  },
  {
    id: "definitions",
    title: "Definitions",
    applies: () => true,
    blocks: ({ v, sec, sectionNo }) => {
      const blocks: ClauseBlock[] = [];
      if (sec.equipment) {
        blocks.push(p('"Equipment"', `means the ${v.model} vending machine(s) specified in Schedule A.`));
      }
      if (sec.location) {
        blocks.push(
          p(
            '"Location Services"',
            `means the services provided by Seller to identify, vet, and secure suitable vending machine placement locations on behalf of Buyer, as further described in Section ${sectionNo("location_services")} and Schedule B.`,
          ),
          p(
            '"Secured Location"',
            "means a location that has been identified, vetted, contacted, and confirmed by Seller as having agreed to host Buyer's vending machine(s), and for which Seller provides written confirmation to Buyer.",
          ),
        );
      }
      if (sec.shipping) {
        // The standalone Storage section only exists when a storage fee is
        // set (sec.shipping && hasStorageFee). When it is absent, referencing
        // "Section ${sectionNo(...)}" would resolve to "Section 0" — there is
        // never a Section 0. Reference the section only when it exists;
        // otherwise point at Schedule C alone.
        const storageNo = sectionNo("storage_program");
        const storageRef =
          storageNo > 0 ? `Section ${storageNo} and Schedule C` : "Schedule C";
        blocks.push(
          p(
            '"Storage Program"',
            `means Seller's optional warehousing and storage services for Equipment prior to deployment, as further described in ${storageRef}.`,
          ),
        );
      }
      if (sec.equipment) {
        blocks.push(
          p(
            '"Procurement"',
            "means the process of ordering, manufacturing, and preparing Equipment for shipment to Buyer or Seller's warehouse facility.",
          ),
          p(
            '"Delivery"',
            "means the physical transfer of Equipment to Buyer's designated delivery address or Seller's storage facility.",
          ),
        );
      }
      blocks.push(
        p(
          '"Business Day"',
          "means any day other than a Saturday, Sunday, or federal holiday observed in the United States.",
        ),
      );
      return blocks;
    },
  },
  {
    id: "equipment_purchase",
    sectionId: "equipment_purchase",
    title: "Equipment Purchase",
    requiresInitials: true,
    applies: ({ sec }) => sec.equipment,
    blocks: ({ v }) => [
      p("3.1 Equipment Description.", "Seller agrees to sell, and Buyer agrees to purchase, the following equipment:"),
      table("equipment"),
      p(
        "3.2 Equipment Specifications.",
        `Each ${v.model} unit includes: 21.5" HD touchscreen display with AI-powered product recognition, integrated cashless payment system (credit/debit card, Apple Pay, Google Pay), cloud-based remote management and inventory tracking, energy-efficient LED lighting with adjustable temperature zones, ADA-compliant design, and standard manufacturer's warranty.`,
      ),
      p("3.3 Condition.", "All Equipment shall be new and in original manufacturer packaging unless otherwise specified in writing."),
      p(
        "3.4 Title and Risk of Loss.",
        "Title to the Equipment shall pass to Buyer upon Seller's delivery of the Equipment to the designated carrier for shipment. Risk of loss shall transfer to Buyer at the same time.",
      ),
    ],
  },
  {
    id: "shipping_freight",
    sectionId: "shipping_freight",
    title: "Shipping & Freight",
    requiresInitials: true,
    applies: ({ sec }) => sec.shipping,
    blocks: ({ v, sec, sectionNo }) => {
      const delivery = v.hasStorageFee
        ? `Equipment shall be shipped to Buyer's designated delivery address or, if Buyer has enrolled in the Storage Program (Section ${sectionNo("storage_program")}), to Seller's warehouse facility.`
        : "Equipment shall be shipped to Buyer's designated delivery address.";
      void sec;
      return [
        p("4.1 Freight.", `Buyer's freight rate is ${v.freightPerMachine} per machine for delivery within the continental United States.`),
        table("freight"),
        p(
          "4.2 Shipping Timeline.",
          "Seller shall use commercially reasonable efforts to ship Equipment within 15-25 Business Days of payment receipt. Seller shall provide tracking information to Buyer upon shipment.",
        ),
        p("4.3 Delivery Address.", delivery),
        p(
          "4.4 Inspection.",
          "Buyer shall inspect Equipment within five (5) Business Days of delivery and notify Seller of any visible shipping damage. Failure to provide timely notice shall constitute acceptance of the Equipment's physical condition.",
        ),
      ];
    },
  },
  {
    id: "location_services",
    sectionId: "location_services",
    title: "Location Services",
    requiresInitials: true,
    applies: ({ sec }) => sec.location,
    blocks: ({ v }) => [
      p(
        "5.1 Scope of Services.",
        "Seller shall provide Location Services to identify, vet, and secure suitable vending machine placement locations on behalf of Buyer. Seller shall use commercially reasonable efforts to identify locations that meet reasonable criteria for vending machine placement, including but not limited to foot traffic, accessibility, and business type.",
      ),
      table("location"),
      p(
        "5.2 Service Timeline.",
        `Seller shall use commercially reasonable efforts to secure all purchased locations within ${v.locationTimeline} days of the Effective Date or the date full payment is received, whichever is later.`,
      ),
      p(
        "5.3 Location Delivery.",
        "For each Secured Location, Seller shall provide Buyer with: (a) business name and address, (b) contact person and information, (c) confirmed placement details, and (d) any relevant notes about the location.",
      ),
      p(
        "5.4 Location Rejection.",
        `Buyer may reject a Secured Location within five (5) Business Days of delivery if the location does not reasonably meet the criteria for vending machine placement. Buyer's rejection allowance is: ${v.locationRejection}. Rejected locations beyond this allowance shall be considered accepted.`,
      ),
      p(
        "5.5 Replacement.",
        "If Buyer reasonably rejects a Secured Location within the allowance, Seller shall use commercially reasonable efforts to provide a replacement location within thirty (30) days.",
      ),
      p(
        "5.6 No Guarantee of Revenue.",
        "Seller does not guarantee any specific revenue, profit, or return on investment from any Secured Location. Location Services are limited to identifying and securing the location; actual business performance depends on Buyer's operations, product selection, pricing, and market conditions.",
      ),
    ],
  },
  {
    id: "payment_terms",
    sectionId: "payment_terms",
    title: "Payment Terms",
    requiresInitials: true,
    applies: () => true,
    blocks: ({ v, sec }) => {
      const blocks: ClauseBlock[] = [
        p("6.1 Total Amount Due.", "The total amount due prior to procurement of Equipment is:"),
        table("payment"),
        p(
          "6.2 Payment Schedule.",
          "Full payment of the Total Amount Due is required prior to Seller initiating procurement of Equipment. Seller shall not begin procurement until full payment is received and cleared.",
        ),
        p(
          "6.3 Accepted Payment Methods.",
          `Payments may be made via wire transfer, ACH, certified check, or other methods agreed upon in writing.${v.paymentMethodNotes ? ` Note: ${v.paymentMethodNotes}` : ""}`,
        ),
        p("6.4 Late Payments.", "Any amount not paid when due shall bear interest at the rate of 1.5% per month or the maximum rate permitted by law, whichever is less."),
        p("6.5 Taxes.", "All prices are exclusive of applicable sales tax, use tax, and other governmental charges. Buyer shall be responsible for all such taxes and charges applicable to the purchase."),
      ];
      void sec;
      return blocks;
    },
  },
  {
    id: "location_service_payment",
    sectionId: "location_service_payment",
    title: "Location Service Payment Terms",
    requiresInitials: true,
    applies: ({ sec }) => sec.location,
    blocks: ({ v, sectionNo }) => {
      const rejectionRef = `Section ${sectionNo("location_services")}.4`;
      const refund = (n: string) =>
        p(
          `${n} Refund Policy.`,
          `Location Services fees are non-refundable once a location has been secured and delivered to Buyer, unless the location is rejected within the allowance specified in ${rejectionRef} and no replacement is provided.`,
        );
      if (v.depositOnly) {
        // Deferred model: a deposit is due up front (and appears in the
        // Total Due), and the balance is invoiced as each location secures.
        return [
          p("7.1 Invoicing.", "Seller shall invoice Buyer for Location Services upon delivery of each Secured Location. Invoices shall include the location details and the applicable fee."),
          p(
            "7.2 Deposit Payment.",
            `A non-refundable deposit of ${v.locationDeposit} is due prior to procurement of Location Services. Procurement will not begin until the deposit is received and cleared.`,
          ),
          p(
            "7.3 Remaining Balance.",
            `The remaining balance of ${v.locationBalance} shall be invoiced upon fulfillment of secured locations and is due on receipt of the invoice. The total amount invoiced for Location Services shall not exceed the Maximum Service Value of ${v.maxLocationValue}.`,
          ),
          refund("7.4"),
        ];
      }
      // Prepaid model: the full Location Services fee is part of the Total
      // Amount Due Prior to Procurement (Section 6) and is NOT separately
      // invoiced on delivery — otherwise Section 6 and Section 7 would bill
      // the same amount twice.
      const payNo = sectionNo("payment_terms");
      const payRef = payNo > 0 ? `Section ${payNo}` : "the Total Amount Due Prior to Procurement";
      return [
        p(
          "7.1 Payment Included in Total Amount Due.",
          `The full fee for Location Services (Maximum Service Value ${v.maxLocationValue}) is included in the Total Amount Due Prior to Procurement under ${payRef} and is payable in accordance with that Section. Seller shall not separately invoice Buyer for Location Services upon delivery.`,
        ),
        p(
          "7.2 Maximum Value.",
          `The total amount charged for Location Services shall not exceed the Maximum Service Value of ${v.maxLocationValue} without Buyer's prior written consent.`,
        ),
        refund("7.3"),
      ];
    },
  },
  {
    id: "storage_program",
    sectionId: "storage_program",
    title: "Storage Program",
    requiresInitials: true,
    applies: ({ sec, v }) => sec.shipping && v.hasStorageFee,
    blocks: ({ v }) => [
      p(
        "8.1 Storage Services.",
        "Seller offers optional warehousing and storage for Equipment at Seller's facility. If Buyer elects to use the Storage Program, Equipment will be shipped to and held at Seller's warehouse until Buyer is ready for deployment.",
      ),
      table("storage"),
      p(
        "8.2 Free Storage Period.",
        `Buyer shall receive ${v.freeStorageMonths} month${v.freeStorageMonths !== 1 ? "s" : ""} of complimentary storage from the date of Equipment delivery to Seller's facility.`,
      ),
      p(
        "8.3 Storage Fees.",
        `After the free storage period, Buyer shall pay ${v.storageFee} per machine per month. Storage fees are invoiced monthly in advance and due within five (5) Business Days of invoice.`,
      ),
      p(
        "8.4 Insurance.",
        "Seller shall maintain commercially reasonable insurance on stored Equipment. Seller's liability for damage to or loss of stored Equipment shall not exceed the Equipment purchase price.",
      ),
      p(
        "8.5 Retrieval.",
        "Buyer may retrieve Equipment from storage upon five (5) Business Days' written notice. All outstanding storage fees must be paid prior to release of Equipment.",
      ),
    ],
  },
  {
    id: "warranty",
    sectionId: "warranty",
    title: "Warranty",
    applies: () => true,
    blocks: () => [
      p("9.1 Manufacturer's Warranty.", "Equipment is covered by the manufacturer's standard warranty, which Seller shall pass through to Buyer. Seller shall provide Buyer with all warranty documentation."),
      p("9.2 Seller's Warranty.", "Seller warrants that all Equipment sold hereunder shall be new, free from material defects in materials and workmanship, and conform to the specifications set forth in this Agreement at the time of delivery."),
      p("9.3 Warranty Exclusions.", "The warranty does not cover damage resulting from: (a) misuse, negligence, or accident; (b) unauthorized modifications or repairs; (c) improper installation; (d) normal wear and tear; or (e) force majeure events."),
      p(
        "9.4 Disclaimer.",
        "EXCEPT AS EXPRESSLY SET FORTH IN THIS SECTION, SELLER MAKES NO WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.",
        true,
      ),
    ],
  },
  {
    id: "limitation_liability",
    sectionId: "limitation_liability",
    title: "Limitation of Liability",
    applies: () => true,
    blocks: () => [
      p(
        "10.1",
        "IN NO EVENT SHALL EITHER PARTY BE LIABLE TO THE OTHER PARTY FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, REVENUE, DATA, OR BUSINESS OPPORTUNITY, ARISING OUT OF OR RELATED TO THIS AGREEMENT, REGARDLESS OF THE FORM OF ACTION OR THEORY OF LIABILITY, EVEN IF SUCH PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.",
        true,
      ),
      p(
        "10.2",
        "SELLER'S TOTAL AGGREGATE LIABILITY UNDER THIS AGREEMENT SHALL NOT EXCEED THE TOTAL AMOUNT PAID BY BUYER TO SELLER UNDER THIS AGREEMENT.",
        true,
      ),
    ],
  },
  {
    id: "indemnification",
    sectionId: "indemnification",
    title: "Indemnification",
    applies: () => true,
    blocks: () => [
      p(
        "11.1",
        "Each Party shall indemnify, defend, and hold harmless the other Party, its officers, directors, employees, agents, and affiliates from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) any breach of this Agreement by the indemnifying Party; (b) the indemnifying Party's negligence or willful misconduct; or (c) any violation of applicable laws by the indemnifying Party.",
      ),
    ],
  },
  {
    id: "intellectual_property",
    sectionId: "intellectual_property",
    title: "Intellectual Property & Software",
    applies: () => true,
    blocks: () => [
      p("12.1 Software License.", "Equipment includes pre-installed proprietary software. Buyer receives a non-exclusive, non-transferable license to use the software solely in connection with the Equipment. Buyer shall not reverse-engineer, modify, or distribute the software."),
      p("12.2 Updates.", "Seller may, at its discretion, provide software updates and patches. Such updates shall be subject to the terms of this Agreement."),
      p("12.3 Data.", "Buyer retains ownership of all sales and transaction data generated by Buyer's use of the Equipment. Seller may collect and use anonymized, aggregated operational data for product improvement purposes."),
    ],
  },
  {
    id: "confidentiality",
    sectionId: "confidentiality",
    title: "Confidentiality",
    applies: () => true,
    blocks: () => [
      p("13.1", 'Each Party agrees to maintain the confidentiality of all non-public information received from the other Party in connection with this Agreement, including but not limited to pricing, business plans, customer lists, and technical data ("Confidential Information").'),
      p("13.2", "Confidential Information shall not include information that: (a) is or becomes publicly available through no fault of the receiving Party; (b) was known to the receiving Party prior to disclosure; (c) is independently developed without use of Confidential Information; or (d) is required to be disclosed by law or court order."),
      p("13.3", "The obligations of confidentiality shall survive termination of this Agreement for a period of two (2) years."),
    ],
  },
  {
    id: "term_termination",
    sectionId: "term_termination",
    title: "Term and Termination",
    applies: () => true,
    blocks: (ctx) => [
      p("14.1 Term.", "This Agreement shall be effective as of the Effective Date and shall continue until all obligations have been fully performed, unless earlier terminated in accordance with this Section."),
      p("14.2 Termination for Breach.", "Either Party may terminate this Agreement upon thirty (30) days' written notice if the other Party materially breaches any provision and fails to cure such breach within the notice period."),
      p("14.3 Termination for Convenience.", "Buyer may cancel this Agreement prior to Seller initiating procurement, subject to a cancellation fee equal to ten percent (10%) of the Total Amount Due."),
      p(
        "14.4 Effect of Termination.",
        `Upon termination: (a) Buyer shall pay for all Equipment delivered and Location Services rendered prior to termination; (b) all licenses granted hereunder shall survive with respect to Equipment for which payment has been received; (c) ${sectionList(ctx, ["limitation_liability", "indemnification", "confidentiality", "governing_law"])} shall survive termination.`,
      ),
    ],
  },
  {
    id: "force_majeure",
    sectionId: "force_majeure",
    title: "Force Majeure",
    applies: () => true,
    blocks: () => [
      plain(
        'Neither Party shall be liable for any failure or delay in performance due to causes beyond its reasonable control, including but not limited to acts of God, war, terrorism, pandemic, epidemic, government actions, fire, flood, earthquake, strikes, labor disputes, supply chain disruptions, or failures of third-party carriers or suppliers (each, a "Force Majeure Event"). The affected Party shall promptly notify the other Party and use commercially reasonable efforts to mitigate the impact. If a Force Majeure Event continues for more than ninety (90) days, either Party may terminate this Agreement without liability.',
      ),
    ],
  },
  {
    id: "compliance_laws",
    sectionId: "compliance_laws",
    title: "Compliance with Laws",
    applies: () => true,
    blocks: () => [
      plain(
        "Each Party shall comply with all applicable federal, state, and local laws, regulations, and ordinances in connection with its performance under this Agreement. Buyer shall be solely responsible for obtaining all permits, licenses, and approvals required to operate the Equipment at any location.",
      ),
    ],
  },
  {
    id: "assignment",
    sectionId: "assignment",
    title: "Assignment",
    applies: () => true,
    blocks: () => [
      plain(
        "Neither Party may assign this Agreement without the prior written consent of the other Party, except that either Party may assign this Agreement to an affiliate or in connection with a merger, acquisition, or sale of all or substantially all of its assets. Any purported assignment in violation of this Section shall be void.",
      ),
    ],
  },
  {
    id: "independent_contractor",
    sectionId: "independent_contractor",
    title: "Independent Contractor",
    applies: () => true,
    blocks: () => [
      plain(
        "The relationship between the Parties is that of independent contractors. Nothing in this Agreement shall be construed to create a partnership, joint venture, franchise, or employer-employee relationship. Neither Party has the authority to bind the other in any manner whatsoever.",
      ),
    ],
  },
  {
    id: "notices",
    sectionId: "notices",
    title: "Notices",
    applies: () => true,
    blocks: () => [
      plain(
        "All notices required or permitted under this Agreement shall be in writing and shall be deemed duly given when: (a) delivered personally; (b) sent by certified mail, return receipt requested; (c) sent by overnight courier; or (d) sent by email with confirmation of receipt. Notices shall be sent to the addresses set forth above or such other addresses as may be designated in writing.",
      ),
    ],
  },
  {
    id: "governing_law",
    sectionId: "governing_law",
    title: "Governing Law & Dispute Resolution",
    applies: () => true,
    blocks: ({ v }) => [
      p("20.1 Governing Law.", `This Agreement shall be governed by and construed in accordance with the laws of the State of ${v.governingState}, without regard to its conflict of laws provisions.`),
      p("20.2 Dispute Resolution.", `In the event of any dispute arising out of or relating to this Agreement, the Parties shall first attempt to resolve the dispute through good faith negotiation. If the dispute cannot be resolved within thirty (30) days, either Party may initiate binding arbitration in accordance with the rules of the American Arbitration Association in ${v.venueState}.`),
      p("20.3 Venue.", `For any matters not subject to arbitration, the exclusive venue shall be the state or federal courts located in ${v.venueState}, and each Party consents to the jurisdiction of such courts.`),
      p("20.4 Attorneys' Fees.", "In any action to enforce this Agreement, the prevailing Party shall be entitled to recover its reasonable attorneys' fees and costs."),
    ],
  },
  {
    id: "entire_agreement",
    sectionId: "entire_agreement",
    title: "Entire Agreement",
    applies: () => true,
    blocks: () => [
      plain(
        "This Agreement, including all Schedules and Exhibits attached hereto, constitutes the entire agreement between the Parties and supersedes all prior and contemporaneous agreements, representations, and understandings, whether written or oral, relating to the subject matter hereof.",
      ),
    ],
  },
  {
    id: "amendments",
    sectionId: "amendments",
    title: "Amendments",
    applies: () => true,
    blocks: () => [
      plain(
        "This Agreement may only be amended or modified by a written instrument signed by both Parties. No waiver of any provision shall constitute a waiver of any other provision or a continuing waiver.",
      ),
    ],
  },
  {
    id: "severability",
    sectionId: "severability",
    title: "Severability",
    applies: () => true,
    blocks: () => [
      plain(
        "If any provision of this Agreement is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect. The Parties shall negotiate in good faith to replace any invalid provision with a valid provision that achieves the original intent.",
      ),
    ],
  },
  {
    id: "waiver",
    sectionId: "waiver",
    title: "Waiver",
    applies: () => true,
    blocks: () => [
      plain(
        "The failure of either Party to enforce any right or provision of this Agreement shall not constitute a waiver of such right or provision. Any waiver must be in writing and signed by the waiving Party.",
      ),
    ],
  },
  {
    id: "counterparts",
    sectionId: "counterparts",
    title: "Counterparts",
    applies: () => true,
    blocks: () => [
      plain(
        "This Agreement may be executed in counterparts, each of which shall be deemed an original and all of which together shall constitute one and the same instrument. Electronic signatures and digital copies shall have the same legal effect as original signatures.",
      ),
    ],
  },
  {
    id: "headings",
    sectionId: "headings",
    title: "Headings",
    applies: () => true,
    blocks: () => [
      plain(
        "The headings in this Agreement are for convenience of reference only and shall not affect the interpretation or construction of this Agreement.",
      ),
    ],
  },
  {
    id: "no_third_party",
    sectionId: "no_third_party",
    title: "No Third-Party Beneficiaries",
    applies: () => true,
    blocks: () => [
      plain(
        "This Agreement is for the sole benefit of the Parties and their respective permitted successors and assigns. Nothing in this Agreement shall confer any rights or remedies on any third party.",
      ),
    ],
  },
  {
    id: "survival",
    sectionId: "survival",
    title: "Survival",
    applies: () => true,
    blocks: (ctx) => [
      plain(
        `The provisions of ${sectionList(ctx, [
          "warranty",
          "limitation_liability",
          "indemnification",
          "intellectual_property",
          "confidentiality",
          "governing_law",
          "no_third_party",
          "survival",
        ])} shall survive the expiration or termination of this Agreement.`,
      ),
    ],
  },
  {
    id: "good_faith",
    sectionId: "good_faith",
    title: "Good Faith",
    applies: () => true,
    blocks: () => [
      plain(
        "Each Party shall act in good faith in the performance of its obligations under this Agreement and shall cooperate reasonably with the other Party to achieve the purposes of this Agreement.",
      ),
    ],
  },
  {
    id: "electronic_signatures",
    sectionId: "electronic_signatures",
    title: "Electronic Signatures & Consent",
    applies: () => true,
    blocks: () => [
      p("30.1", "The Parties agree that this Agreement may be executed electronically and that electronic signatures shall be legally binding and enforceable in accordance with the Electronic Signatures in Global and National Commerce Act (E-SIGN Act) and applicable state law."),
      p("30.2", "By signing this Agreement electronically, each Party: (a) consents to conduct this transaction electronically; (b) acknowledges that the electronic signature is the legal equivalent of a manual signature; and (c) agrees that a printed version of this electronically signed Agreement shall be admissible in any legal proceeding."),
    ],
  },
  {
    id: "acknowledgment",
    sectionId: "acknowledgment",
    title: "Acknowledgment",
    applies: () => true,
    blocks: () => [
      plain(
        "Each Party acknowledges that it has read this Agreement, fully understands its terms and conditions, and voluntarily agrees to be bound by them. Each Party further represents and warrants that the person executing this Agreement on its behalf is duly authorized to do so.",
      ),
    ],
  },
  /* --------------------------- Schedules --------------------------- */
  {
    id: "schedule_a",
    title: "Schedule A — Order Line Items",
    isSchedule: true,
    requiresInitials: true,
    initialsKey: "schedule_a",
    applies: ({ sec }) => sec.equipment || sec.location || sec.shipping,
    blocks: ({ v }) => {
      const blocks: ClauseBlock[] = [table("line_items")];
      if (v.machineNotes) blocks.push(plain(`Notes: ${v.machineNotes}`));
      return blocks;
    },
  },
  {
    id: "schedule_b",
    title: "Schedule B — Location Services Details",
    isSchedule: true,
    requiresInitials: true,
    initialsKey: "schedule_b",
    applies: ({ sec }) => sec.location,
    blocks: ({ v }) => [
      table("location"),
      p("Service Timeline:", `${v.locationTimeline} days from Effective Date or payment receipt.`),
      p("Payment Terms:", v.locationPayTerms),
      p("Rejection Allowance:", v.locationRejection),
    ],
  },
  {
    id: "schedule_c",
    title: "Schedule C — Shipping & Storage Details",
    isSchedule: true,
    requiresInitials: true,
    initialsKey: "schedule_c",
    applies: ({ sec }) => sec.shipping,
    blocks: ({ v }) => {
      const blocks: ClauseBlock[] = [table("freight")];
      if (v.shippingNotes) blocks.push(plain(`Shipping Notes: ${v.shippingNotes}`));
      return blocks;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Public builder                                                    */
/* ------------------------------------------------------------------ */

export interface BuiltAgreement {
  values: ClauseValues;
  sections: NumberedClause[];
  schedules: NumberedClause[];
  sectionNo: (id: string) => number;
}

/**
 * Resolve inclusion (via sections.ts), assign contiguous display numbers
 * to the numbered sections, and produce the canonical clause content for
 * every applicable section and schedule. Every renderer calls this and
 * renders the result — no renderer authors clause text.
 */
export function buildAgreement(ag: Record<string, unknown>): BuiltAgreement {
  const values = buildClauseValues(ag);
  const sec = resolveAgreementSections(ag as AgreementSectionSource);
  const numberer = createSectionNumberer();

  // First pass: assign display numbers to applicable NUMBERED sections in
  // order, so cross-references (sectionNo) can resolve to any section —
  // even one that renders later.
  const ctxForApplies: ClauseCtx = { v: values, sec, sectionNo: () => 0 };
  const numberedDefs = CLAUSES.filter((c) => !c.isSchedule && c.applies(ctxForApplies));
  for (const def of numberedDefs) numberer.assign(def.id);
  const sectionNo = (id: string) => numberer.numberOf(id) ?? 0;

  const ctx: ClauseCtx = { v: values, sec, sectionNo };

  const sections: NumberedClause[] = numberedDefs.map((def) => {
    const displayNumber = sectionNo(def.id);
    return {
      id: def.id,
      sectionId: def.sectionId ?? null,
      title: def.title,
      displayNumber,
      requiresInitials: def.requiresInitials === true,
      isSchedule: false,
      // Subsection prefixes are authored as literals ("9.1 …") assuming
      // full-inclusion ordering. When a conditional section is excluded the
      // heading number (from the resolver) shifts but the literals do not,
      // so a "Section 8 — Warranty" heading would own "9.1" clauses. Rewrite
      // the section component of every "N.M" label prefix to the section's
      // actual resolved number, preserving the authored subsection ordinal.
      blocks: renumberSubsections(def.blocks(ctx), displayNumber),
    };
  });

  const schedules: NumberedClause[] = CLAUSES.filter(
    (c) => c.isSchedule && c.applies(ctx),
  ).map((def) => ({
    id: def.id,
    sectionId: null,
    title: def.title,
    displayNumber: 0,
    requiresInitials: def.requiresInitials === true,
    initialsKey: def.initialsKey,
    isSchedule: true,
    blocks: def.blocks(ctx),
  }));

  return { values, sections, schedules, sectionNo };
}
