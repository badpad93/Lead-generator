"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { Zap } from "lucide-react";
import LeadGeneratorForm, { RepOption } from "@/app/components/LeadGeneratorForm";

/**
 * CRM shell for Lead Generator — admin + sales-family only.
 * Uses the shared LeadGeneratorForm with the rep picker enabled so
 * users can assign the generated list to another sales rep.
 *
 * Access is enforced server-side by /api/sales/lead-generator via
 * getLeadGeneratorAccess — this page just fetches session + rep
 * options and renders. Placement Providers / paid operators use
 * the /tools/lead-generator shell instead.
 */
export default function SalesLeadGeneratorPage() {
  const [token, setToken] = useState("");
  const [salesUsers, setSalesUsers] = useState<RepOption[]>([]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) return;
      setToken(session.access_token);
      const res = await fetch("/api/sales/users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setSalesUsers(await res.json());
    });
  }, []);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-green-100">
          <Zap className="w-5 h-5 text-green-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Generator</h1>
          <p className="text-sm text-gray-500">Auto-generate outbound call lists from Google Places</p>
        </div>
      </div>

      <LeadGeneratorForm token={token} showRepPicker repOptions={salesUsers} />
    </div>
  );
}
