import { Truck } from "lucide-react";
import { getSmartCoolerSettings } from "@/lib/smartCoolerSettings";

/**
 * Lead-time / estimated-delivery banner shown on the machine purchase
 * surfaces. Admin-editable under the Smart Coolers tab. Renders nothing when
 * disabled or empty. Async server component — reads the singleton settings.
 */
export default async function MachinePurchaseBanner({ className }: { className?: string }) {
  const s = await getSmartCoolerSettings();
  if (!s.bannerEnabled || !s.bannerMessage.trim()) return null;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 ${className ?? ""}`}>
      <Truck className="mt-0.5 h-4 w-4 shrink-0 text-green-primary" />
      <p className="leading-relaxed">{s.bannerMessage}</p>
    </div>
  );
}
