"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import {
  Timer,
  Play,
  Square,
  Loader2,
  Download,
  CircleDot,
  CircleOff,
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
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>([]);
  const [weekEntries, setWeekEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [elapsed, setElapsed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"today" | "week">("today");

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
        setUserId(session.user.id);
      } else {
        setLoading(false);
      }
    });
  }, []);

  const fetchEntries = useCallback(async () => {
    if (!token || !userId) return;
    setLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());

      const [todayRes, weekRes] = await Promise.all([
        fetch(`/api/time-entries?from=${today.toISOString()}&user_id=${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/time-entries?from=${weekStart.toISOString()}&user_id=${userId}`, {
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
  }, [token, userId]);

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
    setError(null);
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
      } else {
        const data = await res.json();
        setError(data.error || "Failed to clock in");
      }
    } catch {
      setError("Network error — please try again");
    } finally { setActing(false); }
  }

  async function clockOut() {
    if (!activeEntry) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch("/api/time-entries", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ entry_id: activeEntry.id, clock_out: new Date().toISOString() }),
      });
      if (res.ok) {
        setActiveEntry(null);
        fetchEntries();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to clock out");
      }
    } catch {
      setError("Network error — please try again");
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

  if (!token || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Time Clock</h1>

      {/* Current Punch Status Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Punched In At</th>
              <th className="px-6 py-3 font-medium">Elapsed</th>
              <th className="px-6 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr className={`border-b ${activeEntry ? "bg-green-50/50" : "bg-white"}`}>
              <td className="px-6 py-4">
                {activeEntry ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
                    <CircleDot className="h-4 w-4 animate-pulse" />
                    Clocked In
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600">
                    <CircleOff className="h-4 w-4" />
                    Clocked Out
                  </span>
                )}
              </td>
              <td className="px-6 py-4 text-gray-900 font-medium">
                {activeEntry
                  ? new Date(activeEntry.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                  : "—"}
              </td>
              <td className="px-6 py-4">
                {activeEntry && elapsed ? (
                  <span className="font-mono text-lg font-bold text-green-700">{elapsed}</span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-6 py-4">
                {activeEntry ? (
                  <button
                    type="button"
                    onClick={clockOut}
                    disabled={acting}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer transition-colors"
                  >
                    {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                    Punch Out
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={clockIn}
                    disabled={acting}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer transition-colors"
                  >
                    {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Punch In
                  </button>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 text-center">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</p>
          <div className="mt-2">
            {activeEntry ? (
              <span className="inline-flex items-center gap-1.5 text-green-700 font-bold text-lg">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                ON
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-gray-500 font-bold text-lg">
                <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                OFF
              </span>
            )}
          </div>
        </div>
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

      {/* Punch History Table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900 mr-3">Punch History</h2>
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
            No punches recorded {view === "today" ? "today" : "this week"}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="px-6 py-3 font-medium">Punch</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">In</th>
                  <th className="px-6 py-3 font-medium">Out</th>
                  <th className="px-6 py-3 font-medium">Duration</th>
                  <th className="px-6 py-3 font-medium">Hours</th>
                </tr>
              </thead>
              <tbody>
                {displayEntries.map((e, i) => (
                  <tr key={e.id} className={`border-b border-gray-50 ${!e.clock_out ? "bg-green-50/30" : ""}`}>
                    <td className="px-6 py-3">
                      {!e.clock_out ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                          #{displayEntries.length - i}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-600">
                      {new Date(e.clock_in).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3 text-gray-900 font-medium">
                      {new Date(e.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-6 py-3">
                      {e.clock_out
                        ? <span className="text-gray-900 font-medium">{new Date(e.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        : <span className="text-green-600 font-medium">— Running —</span>}
                    </td>
                    <td className="px-6 py-3 text-gray-900 font-medium">
                      {e.duration_minutes != null ? formatDuration(e.duration_minutes) : "—"}
                    </td>
                    <td className="px-6 py-3 text-gray-500">
                      {e.duration_minutes != null ? (e.duration_minutes / 60).toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td className="px-6 py-3 text-sm font-semibold text-gray-700" colSpan={4}>Total</td>
                  <td className="px-6 py-3 text-sm font-bold text-gray-900">
                    {formatDuration(displayEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0))}
                  </td>
                  <td className="px-6 py-3 text-sm font-bold text-gray-900">
                    {(displayEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0) / 60).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
