import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "List a Route for Sale",
  description:
    "Sell your vending machine route on Vending Connector's marketplace.",
  alternates: { canonical: "/post-route" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
