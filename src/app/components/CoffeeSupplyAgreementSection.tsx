"use client";

import type { CoffeeSupplySnapshotLike } from "@/lib/agreements/coffeeSupplyPackage";
import { isUsableCoffeeSnapshot } from "@/lib/agreements/coffeeSupplyPackage";

/**
 * Renders the FROZEN Equipment Loan & Beverage Supply Agreement captured on
 * a purchase agreement (coffee_supply_snapshot), so the customer actually
 * sees the terms their single signature covers (Model A parity). Shared by
 * the admin preview and the customer signing page so both show identical
 * captured content — never the latest template.
 *
 * Renders nothing when no usable snapshot is present; callers decide
 * separately whether a required-but-missing snapshot should block sending.
 */
export default function CoffeeSupplyAgreementSection({
  snapshot,
}: {
  snapshot: CoffeeSupplySnapshotLike | null | undefined;
}) {
  if (!isUsableCoffeeSnapshot(snapshot)) return null;
  const s = snapshot as CoffeeSupplySnapshotLike;
  const context = [
    s.version != null ? `Version ${s.version}` : null,
    s.effective_date ? `effective ${s.effective_date}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="mt-8">
      <hr className="my-4" />
      <h2 className="text-lg font-bold text-gray-900">
        {s.title || "Equipment Loan & Beverage Supply Agreement"}
      </h2>
      {context ? <p className="text-xs text-gray-500 mt-0.5">{context}</p> : null}
      <p className="text-sm text-gray-700 mt-2 italic">
        Your signature on this agreement also covers the Equipment Loan &amp;
        Beverage Supply Agreement set out below.
      </p>
      <div
        className="mt-3 prose prose-sm max-w-none text-gray-800"
        dangerouslySetInnerHTML={{ __html: s.content_html as string }}
      />
    </section>
  );
}
