import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import FinancingFab from "./components/FinancingFab";
import MagicLinkHashCatcher from "./components/MagicLinkHashCatcher";
import { CUSTOMER_SHELL_HEADER } from "@/lib/storefrontCtxCookie";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com"
  ),
  title: {
    default: "Vending Connector — Vending Machine Marketplace",
    template: "%s | Vending Connector",
  },
  description:
    "Connect locations that need vending machines with operators ready to serve. The smarter way to place vending machines.",
  openGraph: {
    type: "website",
    siteName: "Vending Connector",
    title: "Vending Connector — The Marketplace for Vending Opportunities",
    description:
      "Connect operators with locations. Find vending routes, post listings, and grow your business.",
    url: "https://vendingconnector.com",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Vending Connector — The Marketplace for Vending Opportunities",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vending Connector — Vending Machine Marketplace",
    description:
      "Connect operators with locations. Find vending routes, post listings, and grow your business.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "/",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Tenant customer routes (storefront + storefront-context auth) drop the
  // global Vending Connector shell so the OPERATOR is the primary brand.
  // The signal is a request header stamped server-side by the middleware,
  // so the decision happens before first paint — no VC nav/footer flash.
  // MagicLinkHashCatcher (an invisible provider) stays mounted either way.
  const customerShell = (await headers()).get(CUSTOMER_SHELL_HEADER) === "1";

  return (
    <html lang="en">
      <body className="bg-light min-h-screen flex flex-col antialiased">
        <MagicLinkHashCatcher />
        {customerShell ? (
          <main className="flex-1">{children}</main>
        ) : (
          <>
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
            <FinancingFab />
          </>
        )}
      </body>
    </html>
  );
}
