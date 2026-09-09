import { describe, it, expect, vi } from "vitest";

/**
 * GET /api/assistant/status is the smallest read-only surface the mode
 * switch needs: exactly `{ enabled }`, never cached, and it answers in
 * both flag states (unlike the other /api/assistant routes, which 404
 * while the flag is off — this one exists to say so).
 */
const flag = { enabled: false };
vi.mock("@/lib/assistant/flags", () => ({ isAssistantEnabled: async () => flag.enabled }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: () => { throw new Error("unused"); } } }));

import { GET } from "./status/route";

describe("GET /api/assistant/status", () => {
  it("returns only { enabled: false } while the flag is off", async () => {
    flag.enabled = false;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ enabled: false });
  });

  it("returns only { enabled: true } when the flag is on, with no other fields", async () => {
    flag.enabled = true;
    const body = await (await GET()).json();
    expect(Object.keys(body)).toEqual(["enabled"]);
    expect(body.enabled).toBe(true);
  });
});
