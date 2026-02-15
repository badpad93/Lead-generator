/**
 * Trigger the lead-generator Apify actor for a given run.
 *
 * Environment variables:
 *   APIFY_API_TOKEN  – Apify API token
 *   APIFY_ACTOR_ID   – Actor ID or name (e.g. "username~lead-generator-worker")
 */

const APIFY_BASE = "https://api.apify.com/v2";

interface ActorRunResponse {
  data: {
    id: string;
    status: string;
    startedAt: string;
  };
}

export async function triggerApifyActor(runId: string): Promise<string> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is not set");

  const actorId = process.env.APIFY_ACTOR_ID;
  if (!actorId) throw new Error("APIFY_ACTOR_ID is not set");

  const url = `${APIFY_BASE}/acts/${actorId}/runs?token=${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as ActorRunResponse;
  console.log(`[apify] Started actor run ${json.data.id} for run ${runId}`);
  return json.data.id;
}
