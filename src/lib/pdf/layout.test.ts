import { describe, it, expect } from "vitest";
import { wrapText, measureWrappedHeight, ellipsize, type Measurable } from "./layout";

/**
 * A deterministic monospace-like font stub: every glyph is `per` points
 * wide, so widthOfTextAtSize(s) === s.length * per * (size/10). Lets us
 * assert wrapping widths exactly without a real font.
 */
function stubFont(perGlyphAt10 = 6): Measurable {
  return {
    widthOfTextAtSize(text: string, size: number) {
      return text.length * perGlyphAt10 * (size / 10);
    },
  };
}

describe("pdf layout — wrapText", () => {
  const font = stubFont(); // 6pt per char at size 10

  it("never returns a line wider than maxWidth", () => {
    const size = 10;
    const maxWidth = 60; // fits 10 chars
    const text = "the quick brown fox jumps over the lazy dog again and again";
    for (const line of wrapText(text, font, size, maxWidth)) {
      expect(font.widthOfTextAtSize(line, size)).toBeLessThanOrEqual(maxWidth);
    }
  });

  it("hard-breaks a single token that is wider than the line", () => {
    const size = 10;
    const maxWidth = 60; // 10 chars
    const longToken = "supercalifragilisticexpialidocious"; // 34 chars
    const lines = wrapText(longToken, font, size, maxWidth);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, size)).toBeLessThanOrEqual(maxWidth);
    }
    // no characters lost
    expect(lines.join("")).toBe(longToken);
  });

  it("hard-breaks a long email / URL with no spaces", () => {
    const size = 8;
    const maxWidth = 48;
    const email = "a.very.long.operator.email.address@somelongcompanydomain.example.com";
    const lines = wrapText(email, font, size, maxWidth);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, size)).toBeLessThanOrEqual(maxWidth);
    }
    expect(lines.join("")).toBe(email);
  });

  it("honors explicit newlines as forced breaks", () => {
    const lines = wrapText("alpha\nbeta\ngamma", font, 10, 1000);
    expect(lines).toEqual(["alpha", "beta", "gamma"]);
  });

  it("returns a single line for short text", () => {
    expect(wrapText("hello", font, 10, 1000)).toEqual(["hello"]);
  });

  it("never loops forever on maxWidth smaller than one glyph", () => {
    const lines = wrapText("abc", font, 10, 1); // 1pt < one glyph (6pt)
    // degrades to one char per line rather than hanging
    expect(lines.join("")).toBe("abc");
  });
});

describe("pdf layout — measureWrappedHeight", () => {
  const font = stubFont();
  it("is lines * lineHeight", () => {
    const size = 10;
    const maxWidth = 60; // 10 chars
    const text = "0123456789 0123456789 0123456789"; // 3 words of 10 chars -> 3 lines
    const lines = wrapText(text, font, size, maxWidth);
    expect(measureWrappedHeight(text, font, size, maxWidth, 14)).toBe(lines.length * 14);
  });
});

describe("pdf layout — ellipsize", () => {
  const font = stubFont();
  it("leaves short text untouched", () => {
    expect(ellipsize("Equipment", font, 8, 1000)).toBe("Equipment");
  });
  it("truncates and appends an ellipsis when too wide", () => {
    const out = ellipsize("Location Services Program", font, 8, 40);
    expect(out.endsWith("…")).toBe(true);
    expect(font.widthOfTextAtSize(out, 8)).toBeLessThanOrEqual(40);
  });
});
