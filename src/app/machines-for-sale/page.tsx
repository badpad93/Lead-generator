import { redirect } from "next/navigation";

/**
 * The machine browse experience has moved to the AI Vending Brands storefront
 * on /smart-coolers (brand lineups at /brands/[slug]). Individual machine
 * detail + checkout still live under /machines-for-sale/[id]. This index
 * redirects to the new storefront.
 */
export default function MachinesForSaleIndex() {
  redirect("/smart-coolers");
}
