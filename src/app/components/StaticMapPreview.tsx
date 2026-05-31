"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";

interface StaticMapPreviewProps {
  city: string;
  state: string;
  zip?: string | null;
  className?: string;
}

export default function StaticMapPreview({ city, state, zip, className = "" }: StaticMapPreviewProps) {
  const [failed, setFailed] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  if (!apiKey || failed) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 rounded-lg ${className}`}>
        <div className="text-center text-gray-400">
          <MapPin className="h-5 w-5 mx-auto mb-1" />
          <span className="text-xs">{city}, {state}</span>
        </div>
      </div>
    );
  }

  const location = zip ? `${city}, ${state} ${zip}` : `${city}, ${state}`;
  const encoded = encodeURIComponent(location);
  const src = `https://maps.googleapis.com/maps/api/staticmap?center=${encoded}&zoom=13&size=400x160&scale=2&maptype=roadmap&style=feature:poi|visibility:off&key=${apiKey}`;

  return (
    <img
      src={src}
      alt={`Map of ${city}, ${state} area`}
      className={`object-cover rounded-lg ${className}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
