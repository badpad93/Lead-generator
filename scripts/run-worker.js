#!/usr/bin/env node
/**
 * CLI worker script.
 * Usage: node scripts/run-worker.js
 *
 * Requires .env.local to be loaded. Use with dotenv:
 *   npx dotenv -e .env.local -- node scripts/run-worker.js
 *
 * Or set env vars directly.
 */

// Load env from .env.local if present
const path = require("path");
const fs = require("fs");

const envPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

async function main() {
  // Dynamic import of the compiled worker
  // For local dev, we use tsx to run TypeScript directly
  const { processNextRun } = await import("../src/lib/worker.ts");

  console.log("[run-worker] Starting worker...");

  let processed = true;
  while (processed) {
    processed = await processNextRun();
    if (processed) {
      console.log("[run-worker] Run completed, checking for more...");
    }
  }

  console.log("[run-worker] No more runs to process. Exiting.");
}

main().catch((err) => {
  console.error("[run-worker] Fatal error:", err);
  process.exit(1);
});
