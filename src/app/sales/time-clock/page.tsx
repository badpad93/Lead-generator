"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import {
  Timer,
  Play,
  Square,
  Loader2,
  Download,
} from "lucide-react";

interface TimeEntry {
  id: string;
  clock_in: string;
  clock_out: string | null;
  duration_minutes: number | null;
  total_hours: number | null;
  notes: string | null;
  admin_edited: boolean;
}

function formatElapsed(start: string): string {
  const ms = Date.now() - new Date(start).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export default function TimeClockPage() {
  const [token, setToken] = useState("");
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>([]);
  const [weekEntries, setWeekEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [elapsed, setElapsed] = useState("");
  const [view, setView] = useState<"today" | "week">("today");

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
      }
    });
  }, []);

  const fetchEntries = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());

      const [todayRes, weekRes] = await Promise.all([
        fetch(`/api/time-entries?from=${today.toISOString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/time-entries?from=${weekStart.toISOString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (todayRes.ok) {
        const data = await todayRes.json();
        const entries: TimeEntry[] = data.entries || [];
        setTodayEntries(entries);
        const open = entries.find((e) => !e.clock_out);
        setActiveEntry(open || null);
      }

      if (weekRes.ok) {
        const data = await weekRes.json();
        setWeekEntries(data.entries || []);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  useEffect(() => {
    if (!activeEntry) { setElapsed(""); return; }
    setElapsed(formatElapsed(activeEntry.clock_in));
    const interval = setInterval(() => {
      setElapsed(formatElapsed(activeEntry.clock_in));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeEntry]);

  async function clockIn() {
    setActing(true);
    try {
      const res = await fetch("/api/time-entries", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveEntry(data.entry);
        fetchEntries();
      }
    } finally { setActing(false); }
  }

  async function clockOut() {
    if (!activeEntry) return;
    setActing(true);
    try {
      const res = await fetch("/api/time-entries", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ entry_id: activeEntry.id, clock_out: new Date().toISOString() }),
      });
      if (res.ok) {
        setActiveEntry(null);
        fetchEntries();
      }
    } finally { setActing(false); }
  }

  const todayTotal = todayEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
  const weekTotal = weekEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
  const displayEntries = view === "today" ? todayEntries : weekEntries;

  function exportCSV() {
    const rows = [["Date", "Clock In", "Clock Out", "Duration", "Total Hours", "Notes"]];
    displayEntries.forEach((e) => {
      rows.push([
        new Date(e.clock_in).toLocaleDateString(),
        new Date(e.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        e.clock_out ? new Date(e.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Active",
        e.duration_minutes != null ? formatDuration(e.duration_minutes) : "",
        e.duration_minutes != null ? (e.duration_minutes / 60).toFixed(2) : "",
        e.notes || "",
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-time-entries-${view}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Time Clock</h1>

      {/* Clock In/Out Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${
              activeEntry ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
            }`}>
              <Timer className="h-7 w-7" />
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {activeEntry ? "Clocked In" : "Clocked Out"}
              </p>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                {activeEntry && elapsed && (
                  <span className="font-semibold text-green-600 text-base">{elapsed}</span>
                )}
                <span>Today: {formatDuration(todayTotal)}</span>
                <span>This Week: {formatDuration(weekTotal)}</span>
              </div>
            </div>
          </div>
          {activeEntry ? (
            <button
              type="button"
              onClick={clockOut}
              disabled={acting}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer"
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              Clock Out
            </button>
          ) : (
            <button
              type="button"
              onClick={clockIn}
              disabled={acting}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
            >
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Clock In
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 text-center">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Today</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{formatDuration(todayTotal)}</p>
          <p className="text-xs text-gray-400">{(todayTotal / 60).toFixed(2)} hours</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 text-center">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">This Week</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{formatDuration(weekTotal)}</p>
          <p className="text-xs text-gray-400">{(weekTotal / 60).toFixed(2)} hours</p>
        </div>
      </div>

      {/* Entries Table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setView("today")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium cursor-pointer ${
                view === "today" ? "bg-green-50 text-green-700" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              Today ({todayEntries.length})
            </button>
            <button
              type="button"
              onClick={() => setView("week")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium cursor-pointer ${
                view === "week" ? "bg-green-50 text-green-700" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              This Week ({weekEntries.length})
            </button>
          </div>
          <button
            type="button"
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>

        {displayEntries.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">
            No time entries {view === "today" ? "today" : "this week"}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Clock In</th>
                  <th className="px-6 py-3 font-medium">Clock Out</th>
                  <th className="px-6 py-3 font-medium">Duration</th>
                  <th className="px-6 py-3 font-medium">Hours</th>
                  <th className="px-6 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {displayEntries.map((e) => (
                  <tr key={e.id} className="border-b border-gray-50">
                    <td className="px-6 py-3 text-gray-600">
                      {new Date(e.clock_in).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3 text-gray-900 font-medium">
                      {new Date(e.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-6 py-3">
                      {e.clock_out
                        ? <span className="text-gray-900 font-medium">{new Date(e.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        : <span className="inline-flex items-center gap-1 text-green-600 font-medium"><span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />Active</span>}
                    </td>
                    <td className="px-6 py-3 text-gray-900">
                      {e.duration_minutes != null ? formatDuration(e.duration_minutes) : "—"}
                    </td>
                    <td className="px-6 py-3 text-gray-500">
                      {e.duration_minutes != null ? (e.duration_minutes / 60).toFixed(2) : "—"}
                    </td>
                    <td className="px-6 py-3 text-gray-400 max-w-[200px] truncate">
                      {e.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td className="px-6 py-3 text-sm font-semibold text-gray-700" colSpan={3}>Total</td>
                  <td className="px-6 py-3 text-sm font-bold text-gray-900">
                    {formatDuration(displayEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0))}
                  </td>
                  <td className="px-6 py-3 text-sm font-bold text-gray-900">
                    {(displayEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0) / 60).toFixed(2)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
