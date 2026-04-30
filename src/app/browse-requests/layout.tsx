import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Locations for Sale",
  description:
    "Explore open vending machine placement requests from locations across the country.",
  alternates: { canonical: "/browse-requests" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
