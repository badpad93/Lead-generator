import type { Metadata } from "next";
import "./globals.css";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-light min-h-screen flex flex-col antialiased">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
