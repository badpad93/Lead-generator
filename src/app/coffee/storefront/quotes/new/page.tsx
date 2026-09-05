import { Suspense } from "react";
import QuoteBuilder from "./QuoteBuilder";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <QuoteBuilder quoteId={id ?? null} />
    </Suspense>
  );
}
