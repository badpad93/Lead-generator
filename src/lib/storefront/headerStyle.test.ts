import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  resolveHeaderPresentation,
  headerStyle,
  isHeaderMode,
  DEFAULT_HEADER_COLOR,
} from "./headerStyle";

/* Header solid-color vs uploaded-graphic resolution. Existing storefronts
 * (no header fields) must resolve to their saved solid color unchanged. */

describe("resolveHeaderPresentation — defaults & existing storefronts", () => {
  it("no header fields → solid color from primary_color (existing storefronts unchanged)", () => {
    const r = resolveHeaderPresentation({ primary_color: "#003366" });
    expect(r.mode).toBe("color");
    expect(r.usesImage).toBe(false);
    expect(r.backgroundColor).toBe("#003366");
    expect(r.backgroundImageUrl).toBeNull();
  });
  it("empty brand → default color, color mode", () => {
    const r = resolveHeaderPresentation({});
    expect(r.mode).toBe("color");
    expect(r.backgroundColor).toBe(DEFAULT_HEADER_COLOR);
  });
  it("null brand → default color", () => {
    expect(resolveHeaderPresentation(null).backgroundColor).toBe(DEFAULT_HEADER_COLOR);
  });
});

describe("resolveHeaderPresentation — image mode", () => {
  it("image mode + usable url → image, color kept as fallback base", () => {
    const r = resolveHeaderPresentation({
      header_mode: "image",
      header_image_url: "https://cdn/hdr.jpg",
      primary_color: "#111",
    });
    expect(r.usesImage).toBe(true);
    expect(r.mode).toBe("image");
    expect(r.backgroundImageUrl).toBe("https://cdn/hdr.jpg");
    expect(r.backgroundColor).toBe("#111"); // fallback base still resolved
  });
  it("image mode but MISSING url → falls back to solid color (no broken header)", () => {
    const r = resolveHeaderPresentation({ header_mode: "image", header_image_url: null, primary_color: "#111" });
    expect(r.usesImage).toBe(false);
    expect(r.mode).toBe("color");
    expect(r.backgroundImageUrl).toBeNull();
  });
  it("image mode + blank url → solid color", () => {
    const r = resolveHeaderPresentation({ header_mode: "image", header_image_url: "   " });
    expect(r.usesImage).toBe(false);
  });
  it("color mode ignores any stored image url", () => {
    const r = resolveHeaderPresentation({ header_mode: "color", header_image_url: "https://cdn/hdr.jpg" });
    expect(r.usesImage).toBe(false);
    expect(r.backgroundImageUrl).toBeNull();
  });
});

describe("alt text / decorative", () => {
  it("meaningful alt is exposed", () => {
    const r = resolveHeaderPresentation({
      header_mode: "image",
      header_image_url: "https://cdn/hdr.jpg",
      header_image_alt: "  Sunrise roastery banner ",
    });
    expect(r.altText).toBe("Sunrise roastery banner");
    expect(r.decorative).toBe(false);
  });
  it("blank alt → decorative", () => {
    const r = resolveHeaderPresentation({
      header_mode: "image",
      header_image_url: "https://cdn/hdr.jpg",
      header_image_alt: "  ",
    });
    expect(r.altText).toBeNull();
    expect(r.decorative).toBe(true);
  });
});

describe("headerStyle — CSS object", () => {
  it("color mode → background color only (no image props)", () => {
    const s = headerStyle(resolveHeaderPresentation({ primary_color: "#222", text_color: "#fff" }));
    expect(s.backgroundColor).toBe("#222");
    expect(s.color).toBe("#fff");
    expect(s.backgroundImage).toBeUndefined();
  });
  it("image mode → cover/center/no-repeat over the solid fallback color", () => {
    const s = headerStyle(
      resolveHeaderPresentation({
        header_mode: "image",
        header_image_url: "https://cdn/hdr.jpg",
        primary_color: "#222",
      }),
    );
    expect(s.backgroundColor).toBe("#222"); // fallback retained
    expect(s.backgroundImage).toBe('url("https://cdn/hdr.jpg")');
    expect(s.backgroundSize).toBe("cover");
    expect(s.backgroundPosition).toBe("center");
    expect(s.backgroundRepeat).toBe("no-repeat");
  });
});

describe("isHeaderMode", () => {
  it("accepts only color/image", () => {
    expect(isHeaderMode("color")).toBe(true);
    expect(isHeaderMode("image")).toBe(true);
    expect(isHeaderMode("banner")).toBe(false);
    expect(isHeaderMode(undefined)).toBe(false);
  });
});

/* ---- wiring guards: upload route + render ---- */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("header upload route hardening", () => {
  const src = read("src/app/api/storefront/tenant/brand-asset/route.ts");
  it("accepts asset_type 'header'", () => {
    expect(src).toContain('assetType = assetTypeRaw as "logo" | "favicon" | "header"');
    expect(src).toContain("HEADER_ALLOWED_MIME");
  });
  it("header allowlist is raster-only — SVG excluded", () => {
    // Isolate the HEADER_ALLOWED_MIME set literal and assert no svg in it.
    const block = src.slice(src.indexOf("HEADER_ALLOWED_MIME"), src.indexOf("HEADER_ALLOWED_MIME") + 160);
    expect(block).toContain("image/png");
    expect(block).toContain("image/jpeg");
    expect(block).toContain("image/webp");
    expect(block).not.toContain("svg");
  });
  it("has a dedicated (larger) header size cap", () => {
    expect(src).toContain("HEADER_MAX_BYTES = 5 * 1024 * 1024");
  });
  it("still authorizes via getUserIdFromRequest / getAdminUserId (no broadened access)", () => {
    expect(src).toContain("getUserIdFromRequest");
    expect(src).toContain("getAdminUserId");
  });
});

describe("storefront page + editor render the resolved header", () => {
  it("public storefront page uses resolveHeaderPresentation + headerStyle", () => {
    const src = read("src/app/coffee/o/[slug]/page.tsx");
    expect(src).toContain("resolveHeaderPresentation(brand)");
    expect(src).toContain("headerStyle(header)");
    // meaningful alt exposed to assistive tech via role/aria-label
    expect(src).toContain('role: "img"');
    expect(src).toContain('"aria-label": header.altText');
  });
  it("BrandEditor exposes a Header style toggle + graphic uploader", () => {
    const src = read("src/app/coffee/storefront/brand/BrandEditor.tsx");
    expect(src).toContain('title="Header style"');
    expect(src).toContain('header_mode: "image"');
    expect(src).toContain('header_mode: "color"');
    expect(src).toContain('uploadAsset(file, "header")');
  });
});
