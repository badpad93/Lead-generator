import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Route Details",
};

export default function RouteDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
