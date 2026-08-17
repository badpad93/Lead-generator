import type { Metadata } from "next";
import HomePageClient from "./HomePageClient";

export const metadata: Metadata = {
  title: "Vending Connector | Machines, Financing, Locations & Vending Growth Services",
  description:
    "Grow your vending business with Vending Connector. Explore vending machines, long-term financing, location services, free coffee programs, websites and placement opportunities.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Vending Connector | The Growth Platform for Modern Vending",
    description:
      "Machines, financing, coffee, locations, websites and a Placement Provider marketplace — all through Vending Connector.",
    url: "/",
    type: "website",
  },
};

export default function HomePage() {
  return <HomePageClient />;
}
