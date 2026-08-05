import Link from "next/link";
import { Warehouse, Truck, Package, Settings, ChevronLeft } from "lucide-react";

/**
 * Inventory setup hub. Four cards linking to the management screens
 * for warehouses, suppliers, SKUs, and global forecast config.
 * Server component — no state.
 */
export default function InventorySetupPage() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link href="/admin/inventory" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ChevronLeft className="h-4 w-4" /> Inventory
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <Settings className="h-6 w-6 text-emerald-600" />
        Inventory Setup
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Reference data and global forecast defaults. Warehouse admins live here
        when onboarding new SKUs, changing suppliers, or tuning the engine.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SetupCard
          href="/admin/inventory/setup/warehouses"
          icon={<Warehouse className="h-5 w-5 text-emerald-600" />}
          title="Warehouses"
          desc="Physical locations that hold inventory. Multi-warehouse ready — every ledger event is warehouse-scoped."
        />
        <SetupCard
          href="/admin/inventory/setup/suppliers"
          icon={<Truck className="h-5 w-5 text-emerald-600" />}
          title="Suppliers"
          desc="Vendors you buy from. Each supplier carries a default lead time; SKUs can override per-SKU."
        />
        <SetupCard
          href="/admin/inventory/setup/skus"
          icon={<Package className="h-5 w-5 text-emerald-600" />}
          title="SKUs"
          desc="Everything countable: coffee, cups, lids, brewers, supplies. Link marketplace coffee_products so fulfillment consumption bridges cleanly."
        />
        <SetupCard
          href="/admin/inventory/setup/config"
          icon={<Settings className="h-5 w-5 text-emerald-600" />}
          title="Forecast Config"
          desc="Global defaults the engine uses: lookback, safety stock %, order cycle, forecast method, weight buckets, default warehouse."
        />
      </div>
    </div>
  );
}

function SetupCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-gray-200 bg-white p-5 hover:border-emerald-300 hover:shadow-sm transition"
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      </div>
      <p className="text-sm text-gray-500">{desc}</p>
    </Link>
  );
}
