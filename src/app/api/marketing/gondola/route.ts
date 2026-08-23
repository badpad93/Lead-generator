import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  GONDOLA_BUCKET,
  GONDOLA_SLOTS,
  type GondolaSlot,
} from "@/lib/marketingGondola";

/**
 * GET /api/marketing/gondola
 *
 * Public endpoint (no auth). Returns the current admin-uploaded
 * image for each of the 5 gondola slots, or null when a slot has
 * no override and the client should fall back to the built-in
 * placeholder SVG at /public/images/marketing/<slot>.svg.
 *
 * Response shape (stable — the gondola component depends on this):
 *   {
 *     images: {
 *       coffee:            { url, uploaded_at } | null,
 *       "10-10-10":        { url, uploaded_at } | null,
 *       financing:         { url, uploaded_at } | null,
 *       "ai-vending":      { url, uploaded_at } | null,
 *       "website-services":{ url, uploaded_at } | null,
 *     }
 *   }
 *
 * URLs include a `?v=<uploaded_at_epoch>` cache-buster so a swapped
 * image reaches every viewer on the next page load without waiting
 * for the CDN to purge the old public URL.
 *
 * Cached at the CDN for 60s — the gondola isn't real-time and the
 * cache-buster query string handles genuine updates.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("marketing_gondola_images")
    .select("slot, storage_path, uploaded_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const bySlot: Record<GondolaSlot, { url: string; uploaded_at: string } | null> = {
    coffee: null,
    "10-10-10": null,
    financing: null,
    "ai-vending": null,
    "website-services": null,
  };

  for (const row of data ?? []) {
    const slot = row.slot as GondolaSlot;
    if (!(GONDOLA_SLOTS as readonly string[]).includes(slot)) continue;
    const { data: pub } = supabaseAdmin.storage
      .from(GONDOLA_BUCKET)
      .getPublicUrl(row.storage_path);
    if (!pub?.publicUrl) continue;
    const v = new Date(row.uploaded_at).getTime();
    bySlot[slot] = {
      url: `${pub.publicUrl}?v=${v}`,
      uploaded_at: row.uploaded_at,
    };
  }

  // No CDN caching on the JSON — uploads need to propagate to every
  // viewer on their next page load without waiting for a 60s CDN
  // window to expire. The response is tiny (5 rows) and the cost is
  // negligible. Cache-busting still happens per-image via the
  // ?v=<epoch> suffix on each URL.
  return NextResponse.json(
    { images: bySlot },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
