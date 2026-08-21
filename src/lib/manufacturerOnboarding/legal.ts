/**
 * Versioned Manufacturer Marketplace Partner Agreement text.
 *
 * Source: Vending Connector — Manufacturer Marketplace Partner
 * Agreement (Fillable). Extracted verbatim per Legal authorization.
 *
 * When any term changes:
 *   1. Bump AGREEMENT_VERSION.
 *   2. Update the affected constant below.
 *   3. Existing signed rows keep their signed version;
 *      manufacturer_agreements.agreement_version records exactly which
 *      text the manufacturer agreed to.
 *
 * VC-side variables (operating entity, VC address, VC escalation +
 * technical contacts) are read from env at PDF gen time so they can
 * be adjusted without redeploying the constants. Defaults are set
 * for local dev but should be overridden in every real environment
 * via NEXT_PUBLIC_VC_OPERATING_ENTITY, VC_LEGAL_ADDRESS,
 * VC_ESCALATION_CONTACT, VC_TECHNICAL_CONTACT.
 */

export const AGREEMENT_VERSION = "2026-01-v1";
export const GOVERNING_LAW = "State of South Carolina";

// VC-side variables — env-driven with dev defaults. Any production
// deploy MUST set these; the agreement gate refuses to render if
// they're still at the placeholder strings.
export function getVcParties() {
  return {
    operatingEntity:
      process.env.NEXT_PUBLIC_VC_OPERATING_ENTITY ||
      process.env.VC_OPERATING_ENTITY ||
      "Vending Connector, LLC",
    address:
      process.env.VC_LEGAL_ADDRESS ||
      "[VC LEGAL ADDRESS — SET VC_LEGAL_ADDRESS]",
    escalationContact:
      process.env.VC_ESCALATION_CONTACT ||
      "[VC ESCALATION CONTACT — SET VC_ESCALATION_CONTACT]",
    technicalContact:
      process.env.VC_TECHNICAL_CONTACT ||
      "[VC TECHNICAL CONTACT — SET VC_TECHNICAL_CONTACT]",
  };
}

// Preamble
export const PREAMBLE = `This Marketplace Partner Agreement (the "Agreement") is entered into as of the Effective Date below, by and between Vending Connector, through its applicable operating entity ("VC"), and the manufacturer/wholesaler identified below ("Manufacturer"). VC and Manufacturer may each be a "Party" and together the "Parties."

The Parties desire to integrate Manufacturer's vending equipment offerings into the Vending Connector online marketplace so customers may purchase Manufacturer products through VC while Manufacturer fulfills orders directly to the customer.`;

// Each numbered section = one entry. Sub-clauses are separate strings
// in the `clauses` array so the PDF generator can paginate cleanly.
export interface AgreementSection {
  number: string;
  title: string;
  clauses: string[];
}

export const AGREEMENT_SECTIONS: AgreementSection[] = [
  {
    number: "1",
    title: "Relationship and Scope",
    clauses: [
      "1.1 Marketplace Model. VC will make mutually approved Manufacturer products available for purchase through the Vending Connector marketplace. Unless otherwise agreed in writing, VC will act as a marketplace and customer-acquisition channel and will not purchase, warehouse, take title to, or resell Manufacturer inventory.",
      "1.2 Direct Fulfillment. Manufacturer will be solely responsible for inventory availability, order fulfillment, packaging, freight, delivery coordination, product documentation, warranty administration, and post-delivery product support, except for services expressly undertaken by VC.",
      "1.3 VC Services. VC may independently offer customers financing, location services, installation coordination, websites, marketing, business services, coffee programs, payment solutions, software, training, and other products or services. Manufacturer will have no ownership interest in or entitlement to revenue from such VC services unless expressly stated in an exhibit.",
      "1.4 Independent Contractors. The Parties are independent contractors. Nothing creates a partnership, joint venture, franchise, agency, fiduciary relationship, employment relationship, or exclusive distributorship.",
    ],
  },
  {
    number: "2",
    title: "Products and Marketplace Integration",
    clauses: [
      "2.1 Manufacturer will provide accurate product information, specifications, images, warranty terms, shipping information, inventory status, and other data reasonably required to list the products.",
      "2.2 The Parties will cooperate in good faith to establish an embedded or API-based integration, hosted catalog, data feed, or other mutually acceptable technical connection allowing Manufacturer products to be displayed and purchased through VC.",
      "2.3 Manufacturer will promptly notify VC of material changes to specifications, pricing, inventory, lead times, discontinuations, recalls, or warranty terms.",
      "2.4 VC controls the presentation, merchandising, search placement, bundling of VC services, and customer experience on the Vending Connector marketplace, subject to reasonable brand-usage requirements supplied by Manufacturer.",
    ],
  },
  {
    number: "3",
    title: "Pricing; Marketplace Economics",
    clauses: [
      "3.1 Equipment Pricing Schedule. The Parties will identify each approved machine or equipment item, the Manufacturer's equipment sale price, and the final Vending Connector customer-facing price in the Equipment Pricing Schedule contained in Exhibit A. New equipment may be added by written amendment to Exhibit A, including electronic approval by authorized representatives of both Parties.",
      "3.2 Marketplace Price Protection. Unless otherwise stated in Exhibit A, Manufacturer agrees that the final Vending Connector customer-facing base equipment price will not exceed the applicable Manufacturer equipment sale price by more than $300 per machine. The Parties may agree to a lower differential, including a target range of $200-$300 per machine, on a SKU-by-SKU basis.",
      "3.3 VC Marketplace Revenue. VC will retain the difference between the Manufacturer equipment sale price and the final Vending Connector price, or such other marketplace fee, commission, or amount expressly stated in Exhibit A. The Parties intend that payment routing or split-payment functionality will automatically allocate the agreed Manufacturer proceeds and VC proceeds when technically available.",
      "3.4 Manufacturer may not increase an equipment sale price or materially alter marketplace economics without at least thirty (30) days' prior written notice, except for documented extraordinary freight, tariff, tax, or regulatory changes requiring faster action. VC may suspend affected listings during any pricing dispute.",
      "3.5 Competitive Integrity. Manufacturer will not knowingly structure pricing specifically to make the same machine materially cheaper through a direct channel for the purpose of diverting a VC-originated customer away from VC. Bona fide promotions, negotiated fleet pricing, distributor programs, and pre-existing customer arrangements are permitted if not used to circumvent this Agreement.",
    ],
  },
  {
    number: "4",
    title: "Checkout; Payment; Taxes",
    clauses: [
      "4.1 Customer orders may be processed through VC's payment infrastructure or an integrated third-party payment provider. The Parties will cooperate to implement split settlements or other routing so that each Party receives its predetermined portion of collected funds.",
      "4.2 Each Party is responsible for its own income, franchise, payroll, and similar taxes. Responsibility for sales, use, VAT, customs, duties, tariffs, and marketplace-facilitator obligations will be allocated based on applicable law and the checkout structure implemented by the Parties.",
      "4.3 Chargebacks, refunds, cancellations, fraud losses, and payment disputes will be allocated to the Party responsible for the underlying cause. Manufacturer is responsible for amounts arising from product defects, non-shipment, shipping errors, inaccurate product descriptions supplied by Manufacturer, warranty failures, or Manufacturer cancellation. VC is responsible for amounts arising solely from VC's unauthorized representations or VC-specific services.",
    ],
  },
  {
    number: "5",
    title: "Orders, Shipping and Fulfillment",
    clauses: [
      "5.1 Manufacturer will acknowledge orders promptly and use commercially reasonable efforts to meet the lead times shown on the marketplace.",
      "5.2 Manufacturer will ship directly to the customer's designated destination and provide tracking, carrier information, and shipment status electronically when available.",
      "5.3 Manufacturer will not substitute materially different equipment without the customer's and VC's written approval.",
      "5.4 Manufacturer will maintain commercially reasonable packaging, freight practices, insurance, and procedures for concealed damage, lost shipments, and freight claims.",
      "5.5 Specific service levels, target fulfillment times, escalation contacts, and remedies may be stated in Exhibit B.",
    ],
  },
  {
    number: "6",
    title: "Warranty; Product Support",
    clauses: [
      "6.1 Manufacturer remains the manufacturer/seller responsible for product quality, product warranties, safety, regulatory compliance, replacement parts, technical support, and warranty claims for Manufacturer products.",
      "6.2 Manufacturer will honor at least the same standard written warranty for VC marketplace customers that it provides to similarly situated direct or reseller customers.",
      "6.3 VC may assist with customer communications but does not assume Manufacturer's warranty or product-liability obligations.",
    ],
  },
  {
    number: "7",
    title: "VC-Originated Customers; Non-Circumvention",
    clauses: [
      "7.1 A \"VC-Originated Customer\" means a customer that first purchases, submits a qualified machine inquiry, applies for machine financing, or is otherwise introduced to Manufacturer through VC or a VC-controlled sales process, excluding customers Manufacturer can document were active customers or active qualified opportunities in Manufacturer's records before the VC introduction.",
      "7.2 For twenty-four (24) months after a VC-Originated Customer's most recent marketplace purchase or qualified introduction, Manufacturer will not knowingly solicit or induce that customer to purchase the same or substantially similar Manufacturer equipment outside VC for the purpose of avoiding fees payable to VC.",
      "7.3 If a VC-Originated Customer contacts Manufacturer directly during that period regarding an additional equipment purchase, Manufacturer will either route the transaction through VC or ensure VC receives the same marketplace compensation that VC would have earned had the transaction been completed through the marketplace.",
      "7.4 This Section does not prohibit Manufacturer from providing warranty service, technical support, replacement parts, safety communications, or general non-targeted marketing.",
    ],
  },
  {
    number: "8",
    title: "Financing and Ancillary Services",
    clauses: [
      "8.1 VC may market or arrange third-party financing for customer purchases. Manufacturer will reasonably cooperate with documentation required by financing providers, including invoices, serial numbers, specifications, delivery confirmations, and lien-related documentation where applicable.",
      "8.2 Financing approval is not guaranteed. VC is not responsible for a lender's underwriting decisions.",
      "8.3 Manufacturer will not restrict VC from offering ancillary services to marketplace customers unless a restriction is required by law or expressly agreed in writing.",
    ],
  },
  {
    number: "9",
    title: "Customer Data; Confidentiality",
    clauses: [
      "9.1 Each Party may receive customer information necessary to perform its obligations. Each Party will use such information only for legitimate transaction, fulfillment, support, legal, and permitted marketing purposes and will maintain commercially reasonable safeguards.",
      "9.2 Neither Party will sell or disclose the other Party's confidential business information except as necessary to perform this Agreement or as required by law.",
      "9.3 Confidential Information includes non-public pricing, reseller pricing, integration documentation, customer lists, conversion data, financial terms, technical information, business plans, and other information reasonably understood to be confidential. These obligations survive termination for three (3) years; trade secrets remain protected as long as they qualify as trade secrets under applicable law.",
    ],
  },
  {
    number: "10",
    title: "Intellectual Property and Branding",
    clauses: [
      "10.1 Manufacturer grants VC a non-exclusive, revocable, royalty-free license during the Term to use Manufacturer's names, trademarks, logos, product images, specifications, videos, and marketing materials solely to advertise, market, sell, finance, and support Manufacturer products through VC.",
      "10.2 Manufacturer represents that materials it supplies may lawfully be used for these purposes.",
      "10.3 VC retains all rights in the Vending Connector platform, software, workflows, customer experience, data models, branding, content, and integrations developed by or for VC, excluding Manufacturer's pre-existing intellectual property.",
    ],
  },
  {
    number: "11",
    title: "Compliance; Representations",
    clauses: [
      "Each Party represents that it has authority to enter into this Agreement and will comply with applicable laws. Manufacturer further represents that its products will comply with applicable safety, labeling, certification, import/export, accessibility, telecommunications, payment-device, and other regulatory requirements applicable to the equipment it supplies. Manufacturer will promptly notify VC of recalls, material safety issues, or governmental inquiries concerning listed products.",
    ],
  },
  {
    number: "12",
    title: "Indemnification",
    clauses: [
      "12.1 Manufacturer will defend, indemnify, and hold harmless VC and its affiliates, officers, employees, and agents from third-party claims, damages, losses, liabilities, and reasonable legal fees arising from: (a) product defect or product liability; (b) Manufacturer's breach of warranty; (c) Manufacturer's fulfillment, shipping, installation, or support obligations; (d) infringement by Manufacturer-supplied materials or products; or (e) Manufacturer's violation of law.",
      "12.2 VC will defend, indemnify, and hold harmless Manufacturer from third-party claims arising from VC's material breach of this Agreement, VC's independent services, or unauthorized representations made solely by VC.",
    ],
  },
  {
    number: "13",
    title: "Limitation of Liability",
    clauses: [
      "Except for payment obligations, confidentiality breaches, infringement, fraud, willful misconduct, gross negligence, indemnification obligations, or violation of Section 7, neither Party will be liable to the other for consequential, incidental, special, exemplary, or punitive damages. Subject to the foregoing exclusions, each Party's aggregate contractual liability will not exceed the greater of (a) amounts paid or payable to that Party under this Agreement during the preceding twelve months or (b) $25,000. The Parties may revise this cap in Exhibit A.",
    ],
  },
  {
    number: "14",
    title: "Term; Termination",
    clauses: [
      "14.1 The initial term is one (1) year from the Effective Date and automatically renews for successive one-year periods unless either Party gives thirty (30) days' written notice of non-renewal.",
      "14.2 Either Party may terminate for convenience upon sixty (60) days' written notice.",
      "14.3 Either Party may terminate for material breach if the breach is not cured within fifteen (15) days after written notice, or immediately for fraud, insolvency, unlawful conduct, repeated material fulfillment failures, or a material product-safety risk.",
      "14.4 Termination will not affect orders already accepted, accrued payment obligations, warranty obligations, customer support duties, or provisions intended to survive. Section 7 continues for the applicable protection period for customers originated before termination.",
    ],
  },
  {
    number: "15",
    title: "Records; Reporting; Audit",
    clauses: [
      "Manufacturer will provide reasonable order-status and fulfillment reporting needed to reconcile marketplace transactions. Each Party will maintain records supporting amounts payable under this Agreement for at least three (3) years. No more than once annually, and upon reasonable notice, either Party may request a limited audit by an independent professional solely to verify marketplace amounts due; the requesting Party bears the cost unless an underpayment exceeding five percent (5%) is found.",
    ],
  },
  {
    number: "16",
    title: "Publicity",
    clauses: [
      "Neither Party may issue a press release announcing the relationship without the other's approval, not to be unreasonably withheld. After launch, each Party may identify the other as a marketplace or manufacturing partner and use approved brand assets consistent with Section 10.",
    ],
  },
  {
    number: "17",
    title: "Dispute Resolution; Governing Law",
    clauses: [
      "The Parties will first attempt in good faith to resolve disputes through executive-level discussions. If unresolved within thirty (30) days, either Party may pursue available legal remedies. This Agreement and any dispute arising out of or relating to it will be governed by and construed in accordance with the laws of the State of South Carolina, without regard to conflict-of-laws principles. The Parties consent to the jurisdiction of courts of competent jurisdiction located in South Carolina.",
    ],
  },
  {
    number: "18",
    title: "Miscellaneous",
    clauses: [
      "This Agreement and its exhibits constitute the entire agreement concerning the subject matter and supersede prior discussions on that subject. Amendments must be in writing and signed by authorized representatives. Neither Party may assign this Agreement without the other's consent, except to an affiliate or in connection with a merger, reorganization, or sale of substantially all relevant assets, provided the assignee assumes the obligations. Notices may be delivered by nationally recognized courier or email to designated legal/business contacts with confirmation of receipt. If any provision is unenforceable, the remainder remains effective. Waiver of one breach is not a waiver of another. Electronic signatures and counterparts are permitted.",
    ],
  },
];

// Exhibit A + B labels — populated by the manufacturer at signing.
export const EXHIBIT_A_TITLE = "EXHIBIT A — COMMERCIAL TERMS AND EQUIPMENT PRICING SCHEDULE";
export const EXHIBIT_A_INTRO =
  "The Manufacturer Equipment Sale Price is the amount payable to Manufacturer. The Final Vending Connector Price is the customer-facing equipment price on the marketplace. Additional equipment may be added later by written or electronic amendment.";

export const EXHIBIT_B_TITLE = "EXHIBIT B — INTEGRATION AND SERVICE LEVELS";
export const EXHIBIT_B_STANDING_TERMS = [
  "Inventory: Manufacturer will use commercially reasonable efforts to keep marketplace inventory and lead-time information current.",
  "Tracking: Tracking or freight reference will be provided promptly after shipment.",
];

// Variables collected on Step 3 at signing time.
export interface AgreementSigningInput {
  // Exhibit A commercial terms
  shipping_charges_method: string;
  returns_cancellation_terms: string;
  liability_cap_modification: string;
  exclusivity_terms: string;
  // Exhibit B integration + service levels
  integration_notes: string;
  order_acknowledgment_target: string;
  shipment_target: string;
  manufacturer_escalation_contact: string;
  manufacturer_technical_contact: string;
  // Signature block
  signer_printed_name: string;
  signer_title: string;
  signature_type: "typed" | "drawn";
  signature_data: string | null; // base64 PNG when drawn; empty when typed
}
