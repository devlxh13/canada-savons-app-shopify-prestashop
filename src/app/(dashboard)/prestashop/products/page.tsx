"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ProductTable } from "@/components/prestashop/product-table";
import { ProductDetailPanel } from "@/components/prestashop/product-detail-panel";

interface SelectedProduct {
  id: number;
  psId: number;
}

export default function ProductsPage() {
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleLastSyncUpdate = useCallback((date: string | null) => {
    setLastSyncedAt(date);
  }, []);

  async function triggerSync() {
    setSyncing(true);
    try {
      await fetch("/api/sync/local", { method: "POST" });
    } catch {
      // ignore
    }
    setSyncing(false);
  }

  function formatSyncTime(dateStr: string | null): string {
    if (!dateStr) return "Jamais";
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `Il y a ${hours}h${minutes % 60 > 0 ? ` ${minutes % 60}min` : ""}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">PrestaShop Products</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Dernière synchro: {formatSyncTime(lastSyncedAt)}
          </span>
          <Button size="sm" variant="outline" onClick={triggerSync} disabled={syncing}>
            {syncing ? "Sync en cours..." : "Synchroniser"}
          </Button>
        </div>
      </div>

      <ProductTable
        onSelectProduct={(p) => setSelectedProduct({ id: p.id, psId: p.psId })}
        onLastSyncUpdate={handleLastSyncUpdate}
      />

      {selectedProduct && (
        <ProductDetailPanel
          psId={selectedProduct.psId}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
