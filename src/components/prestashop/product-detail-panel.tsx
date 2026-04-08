"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface LocalProductDetail {
  id: number;
  psId: number;
  reference: string | null;
  ean13: string | null;
  weight: number | null;
  active: boolean;
  nameFr: string | null;
  descriptionFr: string | null;
  descriptionShortFr: string | null;
  priceHT: number;
  stockAvailable: number;
  categoryDefault: string | null;
  categoryTags: string[];
  imageDefault: number | null;
  imageIds: number[];
  lastSyncedAt: string;
  sync: {
    shopifyGid: string;
    syncStatus: string;
    lastSyncedAt: string;
  } | null;
}

interface ProductDetailPanelProps {
  psId: number;
  onClose: () => void;
}

export function ProductDetailPanel({ psId, onClose }: ProductDetailPanelProps) {
  const [product, setProduct] = useState<LocalProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    setLoading(true);
    setCurrentImageIndex(0);

    fetch(`/api/products/${psId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setProduct(null);
        } else {
          setProduct(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [psId]);

  async function handleSync() {
    setSyncing(true);
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceType: "products",
        shop: "maison-du-savon-ca.myshopify.com",
        psIds: [psId],
      }),
    });
    setSyncing(false);
  }

  const imageIds = product?.imageIds ?? [];
  const currentImageId = imageIds[currentImageIndex];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-black/50 absolute inset-0" />
      <div
        className="relative w-[420px] bg-background border-l shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background border-b p-3 flex justify-between items-center z-10">
          <span className="text-sm font-semibold">Produit #{psId}</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>

        {loading ? (
          <div className="p-4 space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : product ? (
          <div className="p-4 space-y-6">
            {imageIds.length > 0 ? (
              <div>
                <img
                  src={`/api/prestashop/images/${product.psId}/${currentImageId}`}
                  alt=""
                  className="w-full h-56 object-contain rounded-md bg-muted"
                />
                {imageIds.length > 1 && (
                  <div className="flex gap-2 mt-2 justify-center">
                    {imageIds.map((imgId, i) => (
                      <button
                        key={imgId}
                        onClick={() => setCurrentImageIndex(i)}
                        className={`w-12 h-12 rounded border overflow-hidden ${i === currentImageIndex ? "ring-2 ring-primary" : ""}`}
                      >
                        <img
                          src={`/api/prestashop/images/${product.psId}/${imgId}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
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
              <h3 className="font-semibold text-lg">{product.nameFr || "—"}</h3>
            </div>

            <div className="space-y-2">
              <div>
                <span className="text-xs font-medium text-muted-foreground">Description</span>
                <div
                  className="text-sm"
                  dangerouslySetInnerHTML={{
                    __html: product.descriptionShortFr || product.descriptionFr || "<em>—</em>",
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Prix HT</span>
                <p className="font-medium">{product.priceHT.toFixed(2)} $</p>
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
                <p>{product.weight ? `${product.weight.toFixed(2)} kg` : "—"}</p>
              </div>
            </div>

            <div>
              <span className="text-xs text-muted-foreground">Stock disponible</span>
              <p className="text-lg font-bold">{product.stockAvailable}</p>
            </div>

            {product.categoryTags.length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground">Catégories</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {product.categoryTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Badge variant={product.active ? "default" : "secondary"}>
                {product.active ? "Active" : "Inactive"}
              </Badge>
              {product.sync ? (
                <Badge variant={product.sync.syncStatus === "error" ? "destructive" : "default"}>
                  {product.sync.syncStatus === "synced" ? "✓ Synced" : product.sync.syncStatus}
                </Badge>
              ) : (
                <Badge variant="secondary">Non synced</Badge>
              )}
            </div>

            {product.sync?.shopifyGid && (
              <div className="text-xs text-muted-foreground">
                <p>Shopify: {product.sync.shopifyGid}</p>
                <p>Dernière sync: {new Date(product.sync.lastSyncedAt).toLocaleString()}</p>
              </div>
            )}

            <Button onClick={handleSync} disabled={syncing} className="w-full">
              {syncing ? "Sync en cours..." : product.sync ? "Re-sync ce produit" : "Sync ce produit"}
            </Button>
          </div>
        ) : (
          <div className="p-4 text-muted-foreground">Produit introuvable</div>
        )}
      </div>
    </div>
  );
}
