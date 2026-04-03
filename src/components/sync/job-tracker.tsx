"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface JobStatus {
  jobId: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  logs: { id: string; resourceType: string; psId: number; action: string; details: unknown; createdAt: string }[];
}

export function JobTracker({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState<JobStatus | null>(null);

  async function fetchStatus() {
    const res = await fetch(`/api/sync/${jobId}`);
    setStatus(await res.json());
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [jobId]);

  if (!status) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "Total", value: status.total, color: "" },
          { label: "Created", value: status.created, color: "text-green-600" },
          { label: "Updated", value: status.updated, color: "text-blue-600" },
          { label: "Skipped", value: status.skipped, color: "text-muted-foreground" },
          { label: "Errors", value: status.errors, color: "text-destructive" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{stat.label}</CardTitle></CardHeader>
            <CardContent><p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p></CardContent>
          </Card>
        ))}
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">PS ID</th>
              <th className="p-3 text-left">Action</th>
              <th className="p-3 text-left">Details</th>
              <th className="p-3 text-left">Time</th>
            </tr>
          </thead>
          <tbody>
            {status.logs.map((log) => (
              <tr key={log.id} className="border-b">
                <td className="p-3">{log.resourceType}</td>
                <td className="p-3">{log.psId}</td>
                <td className="p-3"><Badge variant={log.action === "error" ? "destructive" : "default"}>{log.action}</Badge></td>
                <td className="p-3 text-xs text-muted-foreground">{log.details ? JSON.stringify(log.details) : "—"}</td>
                <td className="p-3 text-muted-foreground">{new Date(log.createdAt).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
