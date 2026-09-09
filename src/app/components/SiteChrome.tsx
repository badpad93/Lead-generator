"use client";

import { usePathname } from "next/navigation";
import { isAppShellPath } from "@/lib/storefrontCtxCookie";
import Navbar from "./Navbar";
import FinancingFab from "./FinancingFab";

/**
 * The global Vending Connector chrome (Navbar above, footer and financing
 * button below the page). Full-screen app routes (/assistant) own the whole
 * viewport and never get it.
 *
 * The proxy already stamps the minimal-shell request header for those
 * routes so the root layout skips this component entirely; this is the
 * second, route-based guard for the same rule, decided from the pathname
 * during server rendering (usePathname is available in SSR), so the wrong
 * chrome is never rendered and nothing flashes during hydration.
 */
export default function SiteChrome({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  const pathname = usePathname();
  if (isAppShellPath(pathname ?? "")) return <>{children}</>;
  return (
    <>
      <Navbar />
      {children}
      {footer}
      <FinancingFab />
    </>
  );
}
