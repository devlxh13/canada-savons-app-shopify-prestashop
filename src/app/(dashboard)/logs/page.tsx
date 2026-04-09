"use client";

import { useState, useEffect, useCallback } from "react";
import { FilterBar, FilterState } from "@/components/dashboard/filter-bar";

interface SyncLog {
  id: string;
  jobId: string;
  resourceType: string;
  psId: string | null;
  action: string;
  details: unknown;
  createdAt: string;
}

function dateRangeToSince(range: string): string {
  const now = new Date();
  switch (range) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return start.toISOString();
    }
    case "7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    case "30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d.toISOString();
    }
    default:
      return "";
  }
}

export default function LogsPage() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    dateRange: "7d",
    resourceType: "all",
    status: "all",
    search: "",
  });

  const fetchLogs = useCallback(async (f: FilterState) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", "100");

    const since = dateRangeToSince(f.dateRange);
    if (since) params.set("since", since);
    if (f.resourceType !== "all") params.set("resourceType", f.resourceType);
    if (f.status !== "all") params.set("action", f.status);
    if (f.search) params.set("search", f.search);

    try {
      const res = await fetch(`/api/logs?${params.toString()}`);
      const json = await res.json();
      setLogs(json.data ?? []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(filters);
  }, [fetchLogs, filters]);

  function handleFilter(next: FilterState) {
    setFilters(next);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Sync Logs</h1>
      <FilterBar onFilter={handleFilter} />
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Job</th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">PS ID</th>
              <th className="p-3 text-left">Action</th>
              <th className="p-3 text-left">Details</th>
              <th className="p-3 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">Chargement...</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">No logs found.</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b">
                  <td className="p-3 font-mono text-xs">{log.jobId.slice(0, 8)}…</td>
                  <td className="p-3">{log.resourceType}</td>
                  <td className="p-3">{log.psId ?? "—"}</td>
                  <td className="p-3">{log.action}</td>
                  <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">
                    {log.details ? JSON.stringify(log.details) : "—"}
                  </td>
                  <td className="p-3 text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
