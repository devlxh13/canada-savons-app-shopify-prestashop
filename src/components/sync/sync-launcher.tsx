"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SyncLauncher({ shop }: { shop: string }) {
  const router = useRouter();
  const [resourceType, setResourceType] = useState("products");
  const [psIds, setPsIds] = useState("");
  const [batchSize, setBatchSize] = useState("50");
  const [launching, setLaunching] = useState(false);

  async function handleLaunch() {
    setLaunching(true);
    const body: Record<string, unknown> = { resourceType, shop, batchSize: parseInt(batchSize) };
    if (psIds.trim()) body.psIds = psIds.split(",").map((id) => parseInt(id.trim()));

    const res = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setLaunching(false);
    if (data.jobId) router.push(`/sync/${data.jobId}`);
  }

  return (
    <Card>
      <CardHeader><CardTitle>Launch Sync</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">Resource Type</label>
          <Select value={resourceType} onValueChange={(v) => v && setResourceType(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="products">Products</SelectItem>
              <SelectItem value="customers">Customers</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Specific PS IDs (optional, comma-separated)</label>
          <Input placeholder="e.g. 992,993,994" value={psIds} onChange={(e) => setPsIds(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">Batch Size</label>
          <Input type="number" value={batchSize} onChange={(e) => setBatchSize(e.target.value)} />
        </div>
        <Button onClick={handleLaunch} disabled={launching} className="w-full">
          {launching ? "Launching..." : "Start Sync"}
        </Button>
      </CardContent>
    </Card>
  );
}
