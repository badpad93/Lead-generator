/**
 * Versioned contractor onboarding legal / policy text.
 *
 * When any term changes:
 *   1. Bump AGREEMENT_VERSION.
 *   2. Update the affected constant below.
 *   3. Existing signed rows keep their signed version; the
 *      contractor_onboarding_signatures.document_version column
 *      records exactly which text they agreed to.
 *
 * Substance is copied from the approved Vending Connector / Apex AI
 * Vending 1099 contractor packet. Do not silently rewrite compensation
 * or legal terms here; treat every edit as a compliance change.
 */

export const AGREEMENT_VERSION = "2026-01-v1";

// Documents the contractor signs. document_key values must exactly
// match the CHECK constraint on contractor_onboarding_signatures.
export const SIGNED_DOCUMENTS = [
  "independent_contractor_agreement",
  "commission_agreement",
  "confidentiality_agreement",
  "sales_policy",
  "payment_authorization",
] as const;
export type SignedDocumentKey = (typeof SIGNED_DOCUMENTS)[number];

// ─────────────────────────────────────────────────────────────
// Independent Contractor Agreement
// ─────────────────────────────────────────────────────────────

export const INDEPENDENT_CONTRACTOR_AGREEMENT = {
  title: "Independent Contractor Agreement",
  scopeOfServices: [
    "Outbound sales calls and communications",
    "Inbound sales calls",
    "Outbound customer-support calls",
    "Inbound customer-support calls",
    "Responding to customer questions",
    "Communicating Apex-approved offers",
    "Placing customer orders through approved systems",
    "Scheduling follow-ups and sales calls",
    "Maintaining customer and opportunity information in the CRM",
    "Following Apex AI Vending sales policies and procedures",
    "Escalating questions outside their authorized scope",
  ],
  authorizedRepresentations: {
    may: [
      "Company-approved pricing",
      "Product descriptions",
      "Services",
      "Promotions",
      "Financing representations",
      "Warranties",
      "Delivery timelines",
      "Policies",
      "Terms",
    ],
    mayNot: [
      "Guarantee financing",
      "Guarantee sales or revenue",
      "Guarantee location performance",
      "Invent delivery dates",
      "Modify contracts",
      "Offer unauthorized discounts",
      "Make unauthorized promises",
      "Bind the Company outside written authority",
    ],
  },
  independentContractorStatus: [
    "Contractor is engaged as an Independent Contractor / 1099. Contractor is not an employee of Apex AI Vending LLP or Vending Connector.",
    "Contractor is responsible for applicable taxes.",
    "Contractor is responsible for ordinary business expenses unless otherwise agreed.",
    "Contractor is not entitled to employee benefits.",
    "Contractor is not guaranteed hours.",
    "Contractor is not guaranteed leads.",
    "Contractor is not guaranteed sales.",
    "Contractor is not guaranteed commissions.",
  ],
  noNonCompete:
    "There is expressly NO NON-COMPETE AGREEMENT. Contractor may provide services to other persons or businesses, including businesses that may compete with Company, provided Contractor does not use or disclose Apex AI Vending or Vending Connector confidential information, customer information, lead information, intellectual property, CRM data, or other protected Company information.",
  crmRequirements: [
    "Operate within the approved CRM.",
    "Document customer interactions.",
    "Document sales calls.",
    "Document follow-ups.",
    "Document orders.",
    "Maintain accurate opportunity status.",
    "Maintain accurate ownership/attribution.",
    "Keep customer records current.",
    "Contractor may not improperly modify deal ownership to obtain commissions.",
  ],
} as const;

// ─────────────────────────────────────────────────────────────
// Confidentiality & Customer Data Agreement
// ─────────────────────────────────────────────────────────────

export const CONFIDENTIALITY_AGREEMENT = {
  title: "Confidentiality & Customer Information",
  restrictions: [
    "Customer information may only be used for Apex work.",
    "Company information may only be used for Apex work.",
    "Customer lists cannot be distributed.",
    "Prospect lists cannot be distributed.",
    "Pricing cannot be distributed outside authorized business activity.",
    "Internal company information cannot be distributed.",
    "CRM information cannot be distributed.",
    "Company documents cannot be provided to outside parties unless authorized.",
    "Customer information cannot be sold.",
    "Customer information cannot be reused for another business.",
    "Customer information cannot be exported for personal use.",
  ],
  prohibitedStorageLocations: [
    "Personal contact lists",
    "Personal spreadsheets",
    "Personal databases",
    "Personal email",
    "Personal cloud storage",
    "Screenshots",
    "Download folders",
    "Personal notes systems",
    "Unapproved CRM platforms",
    "Unapproved AI tools",
  ],
  dataDeletionOnTermination: [
    "Stop accessing Company systems",
    "Return Company property",
    "Delete customer information",
    "Delete prospect information",
    "Delete lead lists",
    "Delete downloaded CRM information",
    "Delete Company documents",
    "Delete pricing and internal information",
    "Delete screenshots",
    "Delete personal copies of customer communications",
    "Transfer active opportunities to Apex",
  ],
  acknowledgment:
    "I understand that customer and Company information remains the property of Apex AI Vending / Vending Connector and may not be retained after my relationship with the Company ends.",
} as const;

// ─────────────────────────────────────────────────────────────
// Sales / Customer Support Policy — acknowledgment checkboxes
// ─────────────────────────────────────────────────────────────

export const SALES_POLICY_ACKNOWLEDGMENTS = [
  "I will follow Apex-approved pricing.",
  "I will follow Apex-approved sales offers.",
  "I will accurately represent products and services.",
  "I will not guarantee financing.",
  "I will not guarantee customer revenue.",
  "I will not make unauthorized earnings claims.",
  "I will not promise location performance.",
  "I will not fabricate inventory or delivery dates.",
  "I will document customer interactions in the CRM.",
  "I will honor customer requests to stop communications.",
  "I will comply with approved call/email/text/social outreach procedures.",
  "I will place orders only through approved Company systems.",
  "I will never direct customer payments to a personal account.",
  "I will escalate matters outside my authorization.",
  "I will protect customer information.",
  "I will not distribute Company information to outside parties.",
] as const;

// ─────────────────────────────────────────────────────────────
// Commission Agreement
// ─────────────────────────────────────────────────────────────

export const COMMISSION_SCHEDULE = {
  title: "Commission Schedule",
  items: [
    {
      key: "10_10_10_deal",
      label: "10/10/10 Deal",
      amount: "$1,750 per funded 10/10/10 deal",
      description: "Paid on each qualifying 10/10/10 deal once the customer payment or lender proceeds have settled to Apex.",
    },
    {
      key: "location_sale",
      label: "Location Sale",
      amount: "$400 per location OR 50% of the gross location-service fee actually collected by Apex for that location, whichever is greater",
      description:
        "Example — Apex collects $600: 50% = $300, so commission = $400. Apex collects $1,200: 50% = $600, so commission = $600.",
    },
    {
      key: "coffee_sale",
      label: "Coffee Sale",
      amount: "$150 per funded coffee sale",
      description: "Paid once the customer payment has settled to Apex.",
    },
    {
      key: "website_sale",
      label: "Website Sale",
      amount: "$150 per funded website sale",
      description: "Paid once the customer payment has settled to Apex.",
    },
  ],
  earnedRule: [
    "A commission is considered earned when the required customer payment or lender proceeds have actually settled to Apex.",
    "Pending, authorized, failed, declined, and reversed payments are NOT treated as received funds.",
  ],
  paymentSchedule: [
    "Commissions are paid every Friday.",
    "Each Friday payment covers eligible commissions earned during the previous Friday through Thursday.",
    "Example: Friday Aug 21 through Thursday Aug 27 → paid Friday Aug 28.",
    "If the transaction has not funded by Thursday, the commission moves to the next Friday cycle after funds have settled.",
  ],
  refundsAndChargebacks: [
    "Cancellations, refunds, payment reversals, and chargebacks may result in reconciliation of previously paid commissions.",
    "Commissions that were paid on transactions later reversed or refunded may be recovered from subsequent commission payments.",
  ],
  postTerminationCommissions: [
    "A contractor will not lose an otherwise valid commission merely because the relationship ends before the customer's funds settle.",
    "If the transaction was properly attributable to the contractor before termination, and later satisfies the funding requirement, the commission is paid according to the normal Friday cycle.",
  ],
} as const;

// ─────────────────────────────────────────────────────────────
// Payment Authorization (short — ACH info collected via Plaid/Dwolla)
// ─────────────────────────────────────────────────────────────

export const PAYMENT_AUTHORIZATION = {
  title: "Payment Authorization",
  body: [
    "Contractor authorizes Apex AI Vending / Vending Connector to remit earned commissions via ACH to the bank account linked through the secure Plaid + Dwolla process below.",
    "Contractor confirms that the bank account belongs to the payee identified above.",
    "Contractor may update payment information at any time through the secure onboarding record; changes take effect on the next Friday cycle after verification.",
  ],
} as const;
