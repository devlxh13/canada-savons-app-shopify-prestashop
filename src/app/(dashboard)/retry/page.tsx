"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RetryItem {
  id: string;
  jobId: string;
  resourceType: string;
  psId: number;
  attemptCount: number;
  lastError: string;
  status: string;
  nextRetryAt: string;
  createdAt: string;
}

export default function RetryPage() {
  const [items, setItems] = useState<RetryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  useEffect(() => {
    fetch(`/api/retry?status=${statusFilter}&limit=${limit}&offset=${offset}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items);
        setTotal(d.total);
      });
  }, [statusFilter, offset]);

  async function handleAction(id: string, action: "retry" | "dismiss") {
    await fetch("/api/retry", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const r = await fetch(`/api/retry?status=${statusFilter}&limit=${limit}&offset=${offset}`);
    const d = await r.json();
    setItems(d.items);
    setTotal(d.total);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">File de retry</h1>

      <div className="flex gap-2">
        {["pending", "abandoned", "all"].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => { setStatusFilter(s); setOffset(0); }}
          >
            {s === "pending" ? "En attente" : s === "abandoned" ? "Abandonnés" : "Tous"}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">{total} item(s)</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="pb-2">Type</th>
                <th className="pb-2">PS ID</th>
                <th className="pb-2">Tentatives</th>
                <th className="pb-2">Erreur</th>
                <th className="pb-2">Statut</th>
                <th className="pb-2">Prochain retry</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2">{item.resourceType}</td>
                  <td className="font-mono">{item.psId}</td>
                  <td>{item.attemptCount}</td>
                  <td className="text-red-500 max-w-xs truncate">{item.lastError}</td>
                  <td>
                    <Badge variant={item.status === "pending" ? "default" : "secondary"}>
                      {item.status}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground text-xs">
                    {new Date(item.nextRetryAt).toLocaleString("fr-CA")}
                  </td>
                  <td className="flex gap-1">
                    {item.status !== "resolved" && (
                      <>
                        <Button size="xs" variant="outline" onClick={() => handleAction(item.id, "retry")}>
                          Retry
                        </Button>
                        {item.status === "pending" && (
                          <Button size="xs" variant="ghost" onClick={() => handleAction(item.id, "dismiss")}>
                            Ignorer
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {total > limit && (
            <div className="flex gap-2 mt-4 justify-center">
              <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(offset - limit)}>
                Précédent
              </Button>
              <Button size="sm" variant="outline" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
                Suivant
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
