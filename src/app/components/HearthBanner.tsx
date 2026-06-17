"use client";

import { useEffect, useRef } from "react";

export default function HearthBanner() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (document.getElementById("hearth-script")) return;

    const script = document.createElement("script");
    script.id = "hearth-script";
    script.src = "https://widget.gethearth.com/script.js";
    script.setAttribute("data-orgid", "63488");
    script.setAttribute("data-partner", "bytebite-vending-llc");
    script.async = true;
    containerRef.current.appendChild(script);
  }, []);

  return (
    <div ref={containerRef} className="w-full bg-white border-b border-gray-100">
      <div className="mx-auto max-w-7xl px-4">
        <iframe
          id="hearth-widget_calculator_v1"
          title="Hearth Financing"
          className="w-full border-0"
          style={{ minHeight: "60px" }}
        />
      </div>
    </div>
  );
}
