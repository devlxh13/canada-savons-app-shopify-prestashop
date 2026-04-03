"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface PSProductFull {
  id: number;
  name: { id: string; value: string }[];
  description: { id: string; value: string }[];
  description_short: { id: string; value: string }[];
  price: string;
  reference: string;
  ean13: string;
  weight: string;
  active: string;
  id_default_image: string;
  id_category_default: string;
  associations?: {
    categories?: { id: string }[];
    images?: { id: string }[];
    stock_availables?: { id: string; id_product_attribute: string }[];
  };
}

interface StockInfo {
  id: number;
  id_product: string;
  id_product_attribute: string;
  quantity: string;
}

interface Combination {
  id: number;
  reference: string;
  price: string;
  quantity?: string;
}

interface SyncInfo {
  shopifyGid: string;
  syncStatus: string;
  lastSyncedAt: string;
}

interface ProductDetailPanelProps {
  productId: number;
  syncInfo?: SyncInfo;
  onClose: () => void;
}

function getLang(values: { id: string; value: string }[], langId: string) {
  return values?.find((v) => v.id === langId)?.value ?? "";
}

export function ProductDetailPanel({ productId, syncInfo, onClose }: ProductDetailPanelProps) {
  const [product, setProduct] = useState<PSProductFull | null>(null);
  const [stock, setStock] = useState<StockInfo[]>([]);
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    setLoading(true);
    setCurrentImageIndex(0);

    fetch(`/api/prestashop/products?id=${productId}`)
      .then((r) => r.json())
      .then((data) => {
        setProduct(data);
        setLoading(false);

        fetch(`/api/prestashop/stock_availables?limit=50`)
          .then((r) => r.json())
          .then((json) => {
            const items = (json.data ?? []).filter(
              (s: StockInfo) => String(s.id_product) === String(productId)
            );
            setStock(items);
          })
          .catch(() => {});

        const combIds = data?.associations?.combinations ?? [];
        if (combIds.length > 0) {
          fetch(`/api/prestashop/combinations?limit=100`)
            .then((r) => r.json())
            .then((json) => {
              const combos = (json.data ?? []).filter(
                (c: { id_product?: string }) => String(c.id_product) === String(productId)
              );
              setCombinations(combos);
            })
            .catch(() => {});
        }
      })
      .catch(() => setLoading(false));
  }, [productId]);

  async function handleSync() {
    setSyncing(true);
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceType: "products",
        shop: "maison-du-savon-ca.myshopify.com",
        psIds: [productId],
      }),
    });
    setSyncing(false);
  }

  const images = product?.associations?.images ?? [];
  const currentImage = images[currentImageIndex];
  const totalStock = stock.reduce((sum, s) => sum + parseInt(s.quantity || "0"), 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-black/50 absolute inset-0" />
      <div
        className="relative w-[420px] bg-background border-l shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background border-b p-3 flex justify-between items-center z-10">
          <span className="text-sm font-semibold">Produit #{productId}</span>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        {loading ? (
          <div className="p-4 space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : product ? (
          <div className="p-4 space-y-6">
            {images.length > 0 ? (
              <div>
                <img
                  src={`/api/prestashop/images/${product.id}/${currentImage?.id}`}
                  alt=""
                  className="w-full h-56 object-contain rounded-md bg-muted"
                />
                {images.length > 1 && (
                  <div className="flex gap-2 mt-2 justify-center">
                    {images.map((img, i) => (
                      <button
                        key={img.id}
                        onClick={() => setCurrentImageIndex(i)}
                        className={`w-12 h-12 rounded border overflow-hidden ${i === currentImageIndex ? "ring-2 ring-primary" : ""}`}
                      >
                        <img src={`/api/prestashop/images/${product.id}/${img.id}`} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-40 bg-muted rounded-md flex items-center justify-center text-muted-foreground">
                Pas d&apos;image
              </div>
            )}

            <div>
              <h3 className="font-semibold text-lg">{getLang(product.name, "2")}</h3>
              <p className="text-sm text-muted-foreground">{getLang(product.name, "1")}</p>
            </div>

            <div className="space-y-2">
              <div>
                <span className="text-xs font-medium text-muted-foreground">Description (EN)</span>
                <div className="text-sm" dangerouslySetInnerHTML={{ __html: getLang(product.description_short, "2") || "<em>—</em>" }} />
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Description (FR)</span>
                <div className="text-sm" dangerouslySetInnerHTML={{ __html: getLang(product.description_short, "1") || "<em>—</em>" }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Prix</span>
                <p className="font-medium">{parseFloat(product.price).toFixed(2)} $</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Référence</span>
                <p className="font-mono text-xs">{product.reference || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">EAN13</span>
                <p className="font-mono text-xs">{product.ean13 || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Poids</span>
                <p>{parseFloat(product.weight || "0").toFixed(2)} kg</p>
              </div>
            </div>

            <div>
              <span className="text-xs text-muted-foreground">Stock disponible</span>
              <p className="text-lg font-bold">{totalStock}</p>
            </div>

            {combinations.length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground">Variantes ({combinations.length})</span>
                <div className="rounded-md border mt-1">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-2 text-left">Réf</th>
                        <th className="p-2 text-left">Prix</th>
                        <th className="p-2 text-left">Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combinations.map((c) => (
                        <tr key={c.id} className="border-b">
                          <td className="p-2 font-mono">{c.reference || "—"}</td>
                          <td className="p-2">{parseFloat(c.price || "0").toFixed(2)} $</td>
                          <td className="p-2">{c.quantity ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Badge variant={product.active === "1" ? "default" : "secondary"}>
                {product.active === "1" ? "Active" : "Inactive"}
              </Badge>
              {syncInfo ? (
                <Badge variant={syncInfo.syncStatus === "error" ? "destructive" : "default"}>
                  {syncInfo.syncStatus === "synced" ? "✓ Synced" : syncInfo.syncStatus}
                </Badge>
              ) : (
                <Badge variant="secondary">Non synced</Badge>
              )}
            </div>

            {syncInfo?.shopifyGid && (
              <div className="text-xs text-muted-foreground">
                <p>Shopify: {syncInfo.shopifyGid}</p>
                <p>Dernière sync: {new Date(syncInfo.lastSyncedAt).toLocaleString()}</p>
              </div>
            )}

            <Button onClick={handleSync} disabled={syncing} className="w-full">
              {syncing ? "Sync en cours..." : syncInfo ? "Re-sync ce produit" : "Sync ce produit"}
            </Button>
          </div>
        ) : (
          <div className="p-4 text-muted-foreground">Produit introuvable</div>
        )}
      </div>
    </div>
  );
}
