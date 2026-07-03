import { Clock } from "lucide-react";

export default function InvoicesStub() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Invoices</h1>
      <p className="text-sm text-gray-500 mb-6">
        Invoice aging + per-invoice detail + payment allocations.
      </p>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 flex items-center gap-3">
        <Clock className="h-6 w-6 text-amber-600" />
        <div>
          <p className="text-sm font-medium text-amber-900">Ships in Phase 2</p>
          <p className="text-xs text-amber-700">Aging buckets, per-invoice payment history, admin write-off action.</p>
        </div>
      </div>
    </div>
  );
}
