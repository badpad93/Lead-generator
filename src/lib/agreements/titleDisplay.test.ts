import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hasMeaningfulTitle, displayTitle, nameWithTitle } from "./titleDisplay";

/* Phase 5C-a10 Defect 2 — blank optional title must omit cleanly, never
 * render "[Title]" and never fabricate a legal title. */

describe("displayTitle / hasMeaningfulTitle — blank omits, real renders", () => {
  it("treats null / undefined / empty / whitespace as no title", () => {
    for (const v of [null, undefined, "", "   ", "\t\n"]) {
      expect(hasMeaningfulTitle(v)).toBe(false);
      expect(displayTitle(v)).toBeNull();
    }
  });
  it("renders a real title, trimmed", () => {
    expect(hasMeaningfulTitle("Owner")).toBe(true);
    expect(displayTitle("  Owner ")).toBe("Owner");
  });
  it("never substitutes a guessed legal title", () => {
    // A blank title yields null — not Member/Owner/CEO/Authorized Representative.
    expect(displayTitle("")).not.toBe("Authorized Representative");
    expect(displayTitle(null)).toBeNull();
  });
});

describe("nameWithTitle — 'Name, Title' or just 'Name'", () => {
  it("omits the fragment when blank", () => {
    expect(nameWithTitle("James Padden", "")).toBe("James Padden");
    expect(nameWithTitle("James Padden", null)).toBe("James Padden");
    expect(nameWithTitle("James Padden", "   ")).toBe("James Padden");
  });
  it("appends the title when present", () => {
    expect(nameWithTitle("James Padden", "Owner")).toBe("James Padden, Owner");
  });
});

/* ---- source-level guards: no literal [Title] or fabricated default ---- */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("no renderer emits a literal [Title] or fabricated operator title", () => {
  it("admin agreement page uses the shared helper, not [Title]", () => {
    const src = read("src/app/sales/agreements/[id]/page.tsx");
    expect(src).toContain("nameWithTitle(");
    expect(src).toContain("displayTitle(");
    expect(src).not.toContain('operator_title || "[Title]"');
    expect(src).not.toContain("Title: {title}");
  });
  it("customer signing page never defaults operator title to a guessed value", () => {
    const src = read("src/app/sign/[token]/page.tsx");
    expect(src).not.toContain('operator_title || "Authorized Representative"');
    expect(src).toContain("displayTitle(agreement.operator_title)");
  });
});
