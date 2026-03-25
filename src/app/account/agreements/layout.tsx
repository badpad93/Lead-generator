import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Agreements | VendingConnector",
  description: "View and download your signed agreements on VendingConnector.",
};

export default function AgreementsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
