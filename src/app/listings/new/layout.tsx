import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Listing",
  description:
    "Create a new operator listing to advertise your vending machine services.",
  alternates: { canonical: "/listings/new" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
