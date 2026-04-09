"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FREQUENCY_PRESETS } from "@/lib/cron/schedule";

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

export default function SettingsPage() {
  const [configs, setConfigs] = useState<CronConfigItem[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/cron").then((r) => r.json()).then(setConfigs);
  }, []);

  async function toggleEnabled(resourceType: string, enabled: boolean) {
    setSaving(resourceType);
    await fetch(`/api/settings/cron/${resourceType}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const updated = await fetch("/api/settings/cron").then((r) => r.json());
    setConfigs(updated);
    setSaving(null);
  }

  async function changeFrequency(resourceType: string, cronExpression: string) {
    setSaving(resourceType);
    await fetch(`/api/settings/cron/${resourceType}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cronExpression }),
    });
    const updated = await fetch("/api/settings/cron").then((r) => r.json());
    setConfigs(updated);
    setSaving(null);
  }

  async function runNow(resourceType: string) {
    setSaving(resourceType);
    const res = await fetch(`/api/settings/cron/${resourceType}`, { method: "POST" });
    const data = await res.json();
    setSaving(null);
    if (data.jobId) {
      window.location.href = `/sync/${data.jobId}`;
    }
  }

  function formatDate(d: string | null) {
    if (!d) return "\u2014";
    return new Date(d).toLocaleString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configuration</h1>

      <Card>
        <CardHeader>
          <CardTitle>Planification des syncs</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="pb-2">Ressource</th>
                <th className="pb-2">Fr&eacute;quence</th>
                <th className="pb-2">Actif</th>
                <th className="pb-2">Dernier run</th>
                <th className="pb-2">Prochain</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c.resourceType} className="border-t">
                  <td className="py-3 font-medium">{RESOURCE_LABELS[c.resourceType] ?? c.resourceType}</td>
                  <td>
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      value={c.cronExpression}
                      onChange={(e) => changeFrequency(c.resourceType, e.target.value)}
                      disabled={saving === c.resourceType}
                    >
                      {FREQUENCY_PRESETS.map((p) => (
                        <option key={p.cron} value={p.cron}>{p.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className="cursor-pointer"
                      onClick={() => toggleEnabled(c.resourceType, !c.enabled)}
                      disabled={saving === c.resourceType}
                    >
                      <Badge variant={c.enabled ? "default" : "secondary"}>
                        {c.enabled ? "Actif" : "Inactif"}
                      </Badge>
                    </button>
                  </td>
                  <td className="text-muted-foreground">{formatDate(c.lastRunAt)}</td>
                  <td className="text-muted-foreground">{c.enabled ? formatDate(c.nextRunAt) : "\u2014"}</td>
                  <td>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={saving === c.resourceType}
                      onClick={() => runNow(c.resourceType)}
                    >
                      Run now
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connexions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm font-medium">Shopify</p>
            <p className="text-sm text-muted-foreground">maison-du-savon-ca.myshopify.com</p>
          </div>
          <div>
            <p className="text-sm font-medium">PrestaShop</p>
            <p className="text-sm text-muted-foreground">Configur&eacute; via variables d&apos;environnement</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
