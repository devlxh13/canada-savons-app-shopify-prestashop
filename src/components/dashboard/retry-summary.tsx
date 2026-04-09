"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface RetryData {
  pendingCount: number;
  abandonedCount: number;
  items: {
    id: string;
    resourceType: string;
    psId: number;
    lastError: string;
    status: string;
    attemptCount: number;
  }[];
}

export function RetrySummary() {
  const [data, setData] = useState<RetryData | null>(null);

  useEffect(() => {
    fetch("/api/retry?limit=5&status=pending")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>File de retry</CardTitle>
        <Link href="/retry" className="text-sm text-blue-500 hover:underline">
          Voir tout
        </Link>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">En attente:</span>
            <Badge variant={data.pendingCount > 0 ? "destructive" : "secondary"}>
              {data.pendingCount}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Abandonnés:</span>
            <Badge variant="secondary">{data.abandonedCount}</Badge>
          </div>
        </div>

        {data.items.length > 0 && (
          <div className="space-y-2">
            {data.items.map((item) => (
              <div key={item.id} className="text-xs border rounded p-2">
                <div className="flex justify-between">
                  <span className="font-mono">{item.resourceType} #{item.psId}</span>
                  <span className="text-muted-foreground">x{item.attemptCount}</span>
                </div>
                <p className="text-red-500 truncate">{item.lastError}</p>
              </div>
            ))}
          </div>
        )}

        {data.pendingCount === 0 && data.abandonedCount === 0 && (
          <p className="text-sm text-muted-foreground">Aucun item en retry</p>
        )}
      </CardContent>
    </Card>
  );
}
