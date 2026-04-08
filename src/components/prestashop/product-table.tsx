"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductFilters, type FilterState } from "./product-filters";

interface LocalProduct {
  id: number;
  psId: number;
  reference: string | null;
  active: boolean;
  nameFr: string | null;
  nameEn: string | null;
  priceHT: number;
  stockAvailable: number;
  categoryDefault: string | null;
  categoryTags: string[];
  imageDefault: number | null;
  sync: {
    shopifyGid: string;
    syncStatus: string;
    lastSyncedAt: string;
  } | null;
}

interface ProductTableProps {
  onSelectProduct: (product: { id: number; psId: number }) => void;
  onLastSyncUpdate: (date: string | null) => void;
}

export function ProductTable({ onSelectProduct, onLastSyncUpdate }: ProductTableProps) {
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    status: "all",
    lang: "2",
    sync: "all",
    category: "all",
    image: "all",
    stock: "all",
  });
  const limit = 25;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (filters.search) params.set("search", filters.search);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.category !== "all") params.set("category", filters.category);
    if (filters.stock !== "all") params.set("stock", filters.stock);
    if (filters.sync !== "all") params.set("sync", filters.sync);

    const res = await fetch(`/api/products?${params}`);
    const json = await res.json();
    setProducts(json.data ?? []);
    setTotal(json.total ?? 0);
    if (json.lastSyncedAt) onLastSyncUpdate(json.lastSyncedAt);
    setLoading(false);
  }, [offset, filters.search, filters.status, filters.category, filters.stock, filters.sync, onLastSyncUpdate]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  function getName(product: LocalProduct) {
    return (filters.lang === "2" ? product.nameEn : product.nameFr) || product.nameFr || product.nameEn || "—";
  }

  function getImageUrl(product: LocalProduct): string | null {
    if (!product.imageDefault) return null;
    return `/api/prestashop/images/${product.psId}/${product.imageDefault}`;
  }

  function toggleSelect(psId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(psId)) next.delete(psId);
      else next.add(psId);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.psId)));
    }
  }

  return (
    <div>
      <ProductFilters
        filters={filters}
        onChange={setFilters}
        onApply={fetchProducts}
        categories={[]}
      />

      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{selected.size} sélectionné(s)</span>
          <Button
            size="sm"
            onClick={() => {
              const ids = Array.from(selected);
              fetch("/api/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resourceType: "products", shop: "maison-du-savon-ca.myshopify.com", psIds: ids }),
              });
            }}
          >
            Sync selected to Shopify
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 w-8">
                <input
                  type="checkbox"
                  checked={products.length > 0 && selected.size === products.length}
                  onChange={toggleAll}
                />
              </th>
              <th className="p-3 text-left w-12">Image</th>
              <th className="p-3 text-left">Nom</th>
              <th className="p-3 text-left">Réf</th>
              <th className="p-3 text-left">Prix HT</th>
              <th className="p-3 text-left">Stock</th>
              <th className="p-3 text-left">Catégories</th>
              <th className="p-3 text-left">Statut</th>
              <th className="p-3 text-left">Sync</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="p-3" colSpan={9}>
                    <Skeleton className="h-8 w-full" />
                  </td>
                </tr>
              ))
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-3 text-center text-muted-foreground">
                  Aucun produit trouvé
                </td>
              </tr>
            ) : (
              products.map((p) => {
                const imgUrl = getImageUrl(p);
                return (
                  <tr
                    key={p.psId}
                    className="border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => onSelectProduct({ id: p.id, psId: p.psId })}
                  >
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(p.psId)}
                        onChange={() => toggleSelect(p.psId)}
                      />
                    </td>
                    <td className="p-3">
                      {imgUrl ? (
                        <img src={imgUrl} alt="" className="w-9 h-9 rounded object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                          —
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-medium">{getName(p)}</td>
                    <td className="p-3 font-mono text-xs">{p.reference || "—"}</td>
                    <td className="p-3">{p.priceHT.toFixed(2)} $</td>
                    <td className="p-3">
                      <Badge variant={p.stockAvailable > 0 ? "default" : "destructive"}>
                        {p.stockAvailable}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs max-w-[150px] truncate">
                      {p.categoryTags.length > 0 ? p.categoryTags.join(", ") : "—"}
                    </td>
                    <td className="p-3">
                      <Badge variant={p.active ? "default" : "secondary"}>
                        {p.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {p.sync ? (
                        <Badge variant={p.sync.syncStatus === "error" ? "destructive" : "default"}>
                          {p.sync.syncStatus === "synced" ? "✓ Synced" : p.sync.syncStatus === "error" ? "Erreur" : p.sync.syncStatus}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between mt-4">
        <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
          Précédent
        </Button>
        <span className="text-sm text-muted-foreground">
          {offset + 1}–{offset + products.length} sur {total} produits
        </span>
        <Button variant="outline" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
          Suivant
        </Button>
      </div>
    </div>
  );
}
