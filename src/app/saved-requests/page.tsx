"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import type { VendingRequest } from "@/lib/types";
import RequestCard from "../components/RequestCard";
import { Heart, Loader2, SearchX } from "lucide-react";

interface SavedRow {
  request_id: string;
  created_at: string;
  vending_requests: VendingRequest | null;
}

export default function SavedRequestsPage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<VendingRequest[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setLoading(false);
        return;
      }
      setAccessToken(session.access_token);
      try {
        const res = await fetch("/api/saved-requests", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data: SavedRow[] = await res.json();
          const items: VendingRequest[] = [];
          const ids = new Set<string>();
          for (const row of data) {
            if (row.vending_requests) {
              items.push(row.vending_requests);
              ids.add(row.request_id);
            }
          }
          setRequests(items);
          setSavedIds(ids);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  async function handleUnsave(requestId: string) {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/saved-requests", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ requestId }),
      });
      if (res.ok) {
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(requestId);
          return next;
        });
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="min-h-screen bg-light">
      <section className="border-b border-green-100 bg-gradient-to-b from-light-warm to-light">
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-12 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
              <Heart className="h-7 w-7 text-green-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-black-primary sm:text-4xl">
              Your Saved Requests
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-gray-600 sm:text-lg">
              Requests you&apos;ve saved for later review
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-green-primary" />
          </div>
        )}

        {!loading && requests.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <SearchX className="h-7 w-7 text-green-primary" />
            </div>
            <h3 className="text-lg font-semibold text-black-primary">
              No saved requests yet
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
              Browse available requests and tap the heart icon to save them here.
            </p>
            <Link
              href="/browse-requests"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-green-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-hover"
            >
              Browse Locations
            </Link>
          </div>
        )}

        {!loading && requests.length > 0 && (
          <>
            <p className="mb-6 text-sm text-gray-500">
              {requests.length === 1
                ? "1 saved request"
                : `${requests.length} saved requests`}
            </p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {requests.map((req) => (
                <RequestCard
                  key={req.id}
                  request={req}
                  saved={savedIds.has(req.id)}
                  onSave={() => handleUnsave(req.id)}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
