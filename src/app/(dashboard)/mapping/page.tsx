"use client";

import { useState, useEffect, useCallback } from "react";
import { FilterBar, FilterState } from "@/components/dashboard/filter-bar";

interface IdMapping {
  id: string;
  resourceType: string;
  psId: string;
  shopifyGid: string;
  syncStatus: string;
  lastSyncedAt: string;
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

export default function MappingPage() {
  const [mappings, setMappings] = useState<IdMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    dateRange: "7d",
    resourceType: "all",
    status: "all",
    search: "",
  });

  const fetchMappings = useCallback(async (f: FilterState) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", "100");

    const since = dateRangeToSince(f.dateRange);
    if (since) params.set("since", since);
    if (f.resourceType !== "all") params.set("resourceType", f.resourceType);
    if (f.search) params.set("search", f.search);

    try {
      const res = await fetch(`/api/mapping?${params.toString()}`);
      const json = await res.json();
      setMappings(json.data ?? []);
    } catch {
      setMappings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMappings(filters);
  }, [fetchMappings, filters]);

  function handleFilter(next: FilterState) {
    setFilters(next);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">ID Mappings</h1>
      <FilterBar onFilter={handleFilter} showStatus={false} />
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">PS ID</th>
              <th className="p-3 text-left">Shopify GID</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Last Synced</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">Chargement...</td>
              </tr>
            ) : mappings.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">No mappings found.</td>
              </tr>
            ) : (
              mappings.map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="p-3">{m.resourceType}</td>
                  <td className="p-3">{m.psId}</td>
                  <td className="p-3 font-mono text-xs">{m.shopifyGid}</td>
                  <td className="p-3">{m.syncStatus}</td>
                  <td className="p-3 text-muted-foreground">{new Date(m.lastSyncedAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
