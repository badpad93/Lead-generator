import { describe, it, expect, vi } from "vitest";

// catalogSearch transitively imports the Supabase admin client, whose env
// guard runs at import time. CI's test job has no Supabase variables, so
// stub the client like every other assistant test; nothing here touches
// the database.
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: () => { throw new Error("unused"); } } }));
import { APPROVED_COPY, APPROVED_COPY_VERSION } from "./approvedCopy";
import { PROMPT_VERSION } from "../config";
import { LOCATION_OFFERINGS, locationDetails } from "../catalogSearch";

/**
 * Guards the approved business wording. Retired phrasing must not
 * return; approved qualifiers must stay. Update these only with an
 * explicit business decision, and bump PROMPT_VERSION when doing so.
 */
const RETIRED = [
  "no platform cut",
  "full locator commission",
  "within the next 24 hours",
  "within about 24 hours",
  "at no charge",
  "free brewer",
  "pay for themselves",
  "guarantee",
  "refund",
];

const REQUIRED = [
  "the location team determines the applicable tier",
  "credited toward the applicable placement fee",
  "not a standalone per-location rate",
  "subject to availability and the governing agreements",
  "typically reaches out within one business day",
  "subject to eligibility and lender approval",
  "provided on loan (ownership does not transfer)",
  "compensation is disclosed before an assignment is accepted",
  "No specific revenue or profit outcome can be promised",
];

describe("approved copy", () => {
  it("contains no retired or unapproved wording", () => {
    const lower = APPROVED_COPY.toLowerCase();
    for (const phrase of RETIRED) expect(lower).not.toContain(phrase);
  });

  it("keeps every approved qualifier", () => {
    for (const phrase of REQUIRED) expect(APPROVED_COPY).toContain(phrase);
  });

  it("is versioned alongside the prompt", () => {
    expect(APPROVED_COPY_VERSION).toBe(PROMPT_VERSION);
  });

  it("presents the prepaid program as qualifying bundled pricing, not a standalone rate", () => {
    const prepaid = LOCATION_OFFERINGS.find((o) => o.id === "location-ten-ten-ten")!;
    expect(prepaid.name.toLowerCase()).toContain("qualifying");
    expect(prepaid.summary.toLowerCase()).toContain("not a standalone");
    const detail = locationDetails(["location-ten-ten-ten"])[0];
    expect(detail.description?.toLowerCase()).toContain("governing agreements");
    expect(locationDetails(["location-basic"])[0].attributes.find((a) => a.label === "Deposit")?.value).toContain("applicable placement fee");
  });
});
