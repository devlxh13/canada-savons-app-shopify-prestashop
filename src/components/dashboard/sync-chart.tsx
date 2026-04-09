"use client";

import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SyncStat {
  date: string;
  resourceType: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface ChartData {
  date: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

export function SyncChart() {
  const [days, setDays] = useState(7);
  const [resourceType, setResourceType] = useState<string | null>(null);
  const [data, setData] = useState<ChartData[]>([]);

  useEffect(() => {
    const params = new URLSearchParams({ days: String(days) });
    if (resourceType) params.set("resourceType", resourceType);

    fetch(`/api/stats?${params}`)
      .then((r) => r.json())
      .then((stats: SyncStat[]) => {
        const byDate = new Map<string, ChartData>();
        for (const s of stats) {
          const dateKey = s.date.slice(0, 10);
          const existing = byDate.get(dateKey) ?? { date: dateKey, created: 0, updated: 0, skipped: 0, errors: 0 };
          existing.created += s.created;
          existing.updated += s.updated;
          existing.skipped += s.skipped;
          existing.errors += s.errors;
          byDate.set(dateKey, existing);
        }
        setData(Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)));
      });
  }, [days, resourceType]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Activité de synchronisation</CardTitle>
        <div className="flex gap-2">
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
                {d}j
              </Button>
            ))}
          </div>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={resourceType ?? ""}
            onChange={(e) => setResourceType(e.target.value || null)}
          >
            <option value="">Tous</option>
            <option value="product">Produits</option>
            <option value="customer">Clients</option>
            <option value="order">Commandes</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })} />
            <YAxis />
            <Tooltip labelFormatter={(d) => new Date(d as string).toLocaleDateString("fr-CA")} />
            <Legend />
            <Area type="monotone" dataKey="created" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} name="Créés" />
            <Area type="monotone" dataKey="updated" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="Mis à jour" />
            <Area type="monotone" dataKey="skipped" stackId="1" stroke="#a1a1aa" fill="#a1a1aa" fillOpacity={0.3} name="Ignorés" />
            <Area type="monotone" dataKey="errors" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Erreurs" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
