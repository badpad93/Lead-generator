import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Routes for Sale",
  description:
    "Browse vending machine routes for sale from operators across the country.",
  alternates: { canonical: "/routes-for-sale" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
