"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cronToLabel } from "@/lib/cron/schedule";

interface CronConfigItem {
  resourceType: string;
  enabled: boolean;
  cronExpression: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastJobId: string | null;
}

const RESOURCE_LABELS: Record<string, string> = {
  products: "Produits",
  inventory: "Inventaire",
  customers: "Clients",
  orders: "Commandes",
};

export function ScheduledSyncs() {
  const [configs, setConfigs] = useState<CronConfigItem[]>([]);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/cron").then((r) => r.json()).then(setConfigs);
  }, []);

  async function runNow(resourceType: string) {
    setRunning(resourceType);
    await fetch(`/api/settings/cron/${resourceType}`, { method: "POST" });
    setRunning(null);
    const updated = await fetch("/api/settings/cron").then((r) => r.json());
    setConfigs(updated);
  }

  function formatDate(d: string | null) {
    if (!d) return "\u2014";
    return new Date(d).toLocaleString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Syncs programmés</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-2">Ressource</th>
              <th className="pb-2">Fréquence</th>
              <th className="pb-2">Statut</th>
              <th className="pb-2">Dernier run</th>
              <th className="pb-2">Prochain</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {configs.map((c) => (
              <tr key={c.resourceType} className="border-t">
                <td className="py-2">{RESOURCE_LABELS[c.resourceType] ?? c.resourceType}</td>
                <td>{cronToLabel(c.cronExpression)}</td>
                <td>
                  <Badge variant={c.enabled ? "default" : "secondary"}>
                    {c.enabled ? "Actif" : "Inactif"}
                  </Badge>
                </td>
                <td>{formatDate(c.lastRunAt)}</td>
                <td>{c.enabled ? formatDate(c.nextRunAt) : "\u2014"}</td>
                <td>
                  <Button size="xs" variant="outline" disabled={running === c.resourceType} onClick={() => runNow(c.resourceType)}>
                    {running === c.resourceType ? "..." : "Run now"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
