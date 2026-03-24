/**
 * Generate branded OG image and favicon for Vending Connector.
 *
 * Design: Dark premium background (#0A0A0A) with a subtle connection
 * network motif, glowing green accent nodes, and clean typography.
 *
 * Run: node scripts/generate-brand-assets.mjs
 */

import sharp from "sharp";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Brand palette
const GREEN = "#22C55E";
const GREEN_DARK = "#15803D";
const GREEN_GLOW = "#22C55E";
const BLACK = "#0A0A0A";
const BLACK_LIGHT = "#1A1A1A";
const GRAY = "#6B7280";
const WHITE = "#FFFFFF";

// ─────────────────────────────────────────────────────────────
//  OG IMAGE (1200 x 630)
// ─────────────────────────────────────────────────────────────
async function generateOgImage() {
  const W = 1200;
  const H = 630;

  // Node positions for the connection network
  const nodes = [
    { x: 140, y: 120, r: 6, glow: true },
    { x: 280, y: 200, r: 5, glow: false },
    { x: 100, y: 340, r: 7, glow: true },
    { x: 320, y: 380, r: 4, glow: false },
    { x: 200, y: 500, r: 6, glow: true },
    { x: 400, y: 140, r: 5, glow: false },
    // Right side cluster
    { x: 880, y: 100, r: 5, glow: false },
    { x: 1020, y: 180, r: 7, glow: true },
    { x: 920, y: 320, r: 6, glow: true },
    { x: 1080, y: 400, r: 5, glow: false },
    { x: 960, y: 500, r: 4, glow: true },
    { x: 1100, y: 260, r: 5, glow: false },
    // Bottom scattered
    { x: 500, y: 560, r: 3, glow: false },
    { x: 700, y: 580, r: 3, glow: false },
    { x: 160, y: 560, r: 3, glow: false },
    { x: 1040, y: 540, r: 3, glow: false },
    // Top scattered
    { x: 600, y: 80, r: 3, glow: false },
    { x: 750, y: 60, r: 3, glow: false },
  ];

  // Connection lines between nearby nodes
  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [1, 5],
    [6, 7], [7, 8], [8, 9], [9, 10], [7, 11], [8, 11],
    [3, 12], [12, 13], [4, 14], [9, 15],
    [5, 16], [16, 17], [6, 17],
  ];

  const connectionLines = connections
    .map(([a, b]) => {
      const na = nodes[a];
      const nb = nodes[b];
      return `<line x1="${na.x}" y1="${na.y}" x2="${nb.x}" y2="${nb.y}" stroke="${GREEN_DARK}" stroke-width="1" opacity="0.35"/>`;
    })
    .join("\n    ");

  const nodeCircles = nodes
    .map((n) => {
      if (n.glow) {
        return `
    <circle cx="${n.x}" cy="${n.y}" r="${n.r * 4}" fill="${GREEN}" opacity="0.08"/>
    <circle cx="${n.x}" cy="${n.y}" r="${n.r * 2}" fill="${GREEN}" opacity="0.15"/>
    <circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${GREEN}" opacity="0.9"/>`;
      }
      return `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${GRAY}" opacity="0.25"/>`;
    })
    .join("\n");

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background gradient -->
    <radialGradient id="bg-glow" cx="50%" cy="45%" r="60%">
      <stop offset="0%" stop-color="#0F1A12" />
      <stop offset="100%" stop-color="${BLACK}" />
    </radialGradient>
    <!-- Green glow behind the wordmark -->
    <radialGradient id="title-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${GREEN}" stop-opacity="0.12" />
      <stop offset="100%" stop-color="${GREEN}" stop-opacity="0" />
    </radialGradient>
    <!-- Subtle grid pattern -->
    <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="${WHITE}" stroke-width="0.3" opacity="0.04"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg-glow)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>

  <!-- Connection network -->
  <g>
    ${connectionLines}
    ${nodeCircles}
  </g>

  <!-- Center glow -->
  <ellipse cx="${W / 2}" cy="${H / 2 - 20}" rx="350" ry="200" fill="url(#title-glow)"/>

  <!-- Branded horizontal rule -->
  <rect x="${W / 2 - 60}" y="260" width="120" height="2" rx="1" fill="${GREEN}" opacity="0.6"/>

  <!-- Title: Vending Connector -->
  <text x="${W / 2}" y="235" text-anchor="middle" fill="${WHITE}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="56" font-weight="800" letter-spacing="-1">
    Vending <tspan fill="${GREEN}">Connector</tspan>
  </text>

  <!-- Tagline -->
  <text x="${W / 2}" y="305" text-anchor="middle" fill="${GRAY}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="22" font-weight="500" letter-spacing="0.5">
    The Marketplace for Vending Opportunities
  </text>

  <!-- Three feature pills -->
  <g font-family="Inter, system-ui, -apple-system, sans-serif" font-size="13" font-weight="600">
    <!-- Pill 1: Operators -->
    <rect x="330" y="355" width="140" height="34" rx="17" fill="${GREEN}" opacity="0.12"/>
    <text x="400" y="377" text-anchor="middle" fill="${GREEN}" opacity="0.85">Find Operators</text>

    <!-- Pill 2: Locations -->
    <rect x="490" y="355" width="140" height="34" rx="17" fill="${GREEN}" opacity="0.12"/>
    <text x="560" y="377" text-anchor="middle" fill="${GREEN}" opacity="0.85">Post Locations</text>

    <!-- Pill 3: Routes -->
    <rect x="650" y="355" width="160" height="34" rx="17" fill="${GREEN}" opacity="0.12"/>
    <text x="730" y="377" text-anchor="middle" fill="${GREEN}" opacity="0.85">Browse Routes</text>
  </g>

  <!-- Bottom domain -->
  <text x="${W / 2}" y="${H - 40}" text-anchor="middle" fill="${GRAY}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="15" font-weight="500" letter-spacing="2" opacity="0.5">
    VENDINGCONNECTOR.COM
  </text>

  <!-- Top-left subtle VC mark -->
  <g transform="translate(40, 30)" opacity="0.15">
    <text fill="${GREEN}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="20" font-weight="800">VC</text>
  </g>
</svg>`;

  const pngBuffer = await sharp(Buffer.from(svg))
    .png({ quality: 95, compressionLevel: 6 })
    .toBuffer();

  const outPath = resolve(root, "public", "og-image.png");
  writeFileSync(outPath, pngBuffer);
  console.log(`OG image → ${outPath} (${(pngBuffer.length / 1024).toFixed(1)} KB)`);
}

// ─────────────────────────────────────────────────────────────
//  FAVICON (multi-size .ico via sharp)
// ─────────────────────────────────────────────────────────────
async function generateFavicon() {
  // Design: A bold "VC" monogram with a subtle connector node accent.
  // The "V" nests into the "C" creating a compact, recognizable mark.
  // At small sizes the connector dot on top-right gives it life.

  function faviconSvg(size) {
    const s = size;
    const pad = Math.round(s * 0.1);
    const r = Math.round(s * 0.18); // corner radius

    // Scale factors relative to a 512 base
    const sc = s / 512;

    return `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2DD865"/>
      <stop offset="100%" stop-color="${GREEN_DARK}"/>
    </linearGradient>
  </defs>
  <!-- Rounded square background -->
  <rect x="${pad}" y="${pad}" width="${s - pad * 2}" height="${s - pad * 2}" rx="${r}" fill="${BLACK}"/>

  <!-- VC lettermark -->
  <text x="${s / 2}" y="${s * 0.66}" text-anchor="middle" fill="url(#fg)"
    font-family="Inter, system-ui, -apple-system, Arial, sans-serif"
    font-size="${Math.round(260 * sc)}" font-weight="900" letter-spacing="${Math.round(-8 * sc)}">VC</text>

  <!-- Connector node accent (top-right) -->
  <circle cx="${s - pad - Math.round(r * 0.8)}" cy="${pad + Math.round(r * 0.8)}" r="${Math.round(28 * sc)}" fill="${GREEN}" opacity="0.9"/>
  <circle cx="${s - pad - Math.round(r * 0.8)}" cy="${pad + Math.round(r * 0.8)}" r="${Math.round(14 * sc)}" fill="${WHITE}" opacity="0.9"/>
</svg>`;
  }

  // Generate multiple sizes
  const sizes = [16, 32, 48];
  const pngBuffers = await Promise.all(
    sizes.map(async (size) => {
      const svg = faviconSvg(size);
      return sharp(Buffer.from(svg)).png().toBuffer();
    })
  );

  // Build .ico file manually (ICO format)
  const icoBuffer = buildIco(pngBuffers, sizes);
  const icoPath = resolve(root, "src", "app", "favicon.ico");
  writeFileSync(icoPath, icoBuffer);
  console.log(`Favicon → ${icoPath} (${(icoBuffer.length / 1024).toFixed(1)} KB)`);

  // Also generate higher-res PNGs for apple-touch-icon and icon
  const appleSvg = faviconSvg(180);
  const appleBuffer = await sharp(Buffer.from(appleSvg)).png().toBuffer();
  const applePath = resolve(root, "src", "app", "apple-icon.png");
  writeFileSync(applePath, appleBuffer);
  console.log(`Apple icon → ${applePath} (${(appleBuffer.length / 1024).toFixed(1)} KB)`);

  const iconSvg = faviconSvg(192);
  const iconBuffer = await sharp(Buffer.from(iconSvg)).png().toBuffer();
  const iconPath = resolve(root, "src", "app", "icon.png");
  writeFileSync(iconPath, iconBuffer);
  console.log(`Icon PNG → ${iconPath} (${(iconBuffer.length / 1024).toFixed(1)} KB)`);
}

/**
 * Build a minimal ICO file from PNG buffers.
 * ICO format: 6-byte header, N * 16-byte directory entries, then PNG data.
 */
function buildIco(pngBuffers, sizes) {
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * numImages;
  let dataOffset = headerSize + dirSize;

  // Header: reserved(2) + type(2, 1=ICO) + count(2)
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);       // reserved
  header.writeUInt16LE(1, 2);       // type = ICO
  header.writeUInt16LE(numImages, 4);

  const dirEntries = [];
  const dataChunks = [];

  for (let i = 0; i < numImages; i++) {
    const png = pngBuffers[i];
    const size = sizes[i];

    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);  // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1);  // height
    entry.writeUInt8(0, 2);                        // color palette
    entry.writeUInt8(0, 3);                        // reserved
    entry.writeUInt16LE(1, 4);                     // color planes
    entry.writeUInt16LE(32, 6);                    // bits per pixel
    entry.writeUInt32LE(png.length, 8);            // image data size
    entry.writeUInt32LE(dataOffset, 12);           // offset to data

    dirEntries.push(entry);
    dataChunks.push(png);
    dataOffset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...dataChunks]);
}

// ─────────────────────────────────────────────────────────────
//  RUN
// ─────────────────────────────────────────────────────────────
console.log("Generating Vending Connector brand assets...\n");
await generateOgImage();
await generateFavicon();
console.log("\nDone.");
