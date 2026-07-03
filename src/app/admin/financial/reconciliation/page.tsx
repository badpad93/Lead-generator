import { Clock } from "lucide-react";

export default function ReconciliationStub() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Reconciliation</h1>
      <p className="text-sm text-gray-500 mb-6">
        Daily reconciliation exception queue. Compares provider records against the payment ledger.
      </p>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 flex items-center gap-3">
        <Clock className="h-6 w-6 text-amber-600" />
        <div>
          <p className="text-sm font-medium text-amber-900">Ships in Phase 2</p>
          <p className="text-xs text-amber-700">Cron runs at 5pm ET, flags missing webhooks / amount mismatches / duplicates / orphan refunds.</p>
        </div>
      </div>
    </div>
  );
}
