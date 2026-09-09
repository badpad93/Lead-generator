"use client";

import type {
  CoffeeSupplySnapshotLike,
  CoffeeAcknowledgments,
} from "@/lib/agreements/coffeeSupplyPackage";
import { isUsableCoffeeSnapshot, COFFEE_ACK_LABELS } from "@/lib/agreements/coffeeSupplyPackage";

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
/** Static, read-only acknowledgment list reflecting the PERSISTED state —
 *  a box is checked only when its field is truly true. */
function AcknowledgmentList({ acknowledgments }: { acknowledgments: CoffeeAcknowledgments }) {
  const allAccepted = COFFEE_ACK_LABELS.every((a) => acknowledgments[a.key] === true);
  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
        {allAccepted
          ? "Customer acknowledgments (accepted)"
          : "Required customer acknowledgments (to be accepted at signing)"}
      </p>
      <ul className="space-y-1">
        {COFFEE_ACK_LABELS.map(({ key, label }) => {
          const accepted = acknowledgments[key] === true;
          return (
            <li key={key} className={`text-sm ${accepted ? "text-green-700" : "text-gray-600"}`}>
              <span className="font-mono mr-2">{accepted ? "[x]" : "[ ]"}</span>
              {label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function CoffeeSupplyAgreementSection({
  snapshot,
  acknowledgments,
}: {
  snapshot: CoffeeSupplySnapshotLike | null | undefined;
  /** When provided (e.g. admin preview / read-only view), render a static
   *  acknowledgment list reflecting the PERSISTED state — a box is checked
   *  only when that field is truly true, so an unsigned preview never claims
   *  acceptance. Omit on the customer sign page, which shows interactive
   *  checkboxes instead. */
  acknowledgments?: CoffeeAcknowledgments | null;
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
      {acknowledgments ? <AcknowledgmentList acknowledgments={acknowledgments} /> : null}
    </section>
  );
}
