"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductFilters, type FilterState } from "./product-filters";

interface PSProductRow {
  id: number;
  name: { id: string; value: string }[];
  price: string;
  active: string;
  reference: string;
  id_default_image: string;
  id_category_default: string;
  associations?: {
    categories?: { id: string }[];
    images?: { id: string }[];
  };
}

interface SyncMapping {
  psId: number;
  shopifyGid: string;
  syncStatus: string;
  lastSyncedAt: string;
}

interface Category {
  id: number;
  name: { id: string; value: string }[];
}

interface ProductTableProps {
  onSelectProduct: (product: PSProductRow) => void;
}

export function ProductTable({ onSelectProduct }: ProductTableProps) {
  const [products, setProducts] = useState<PSProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [syncMap, setSyncMap] = useState<Map<number, SyncMapping>>(new Map());
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryMap, setCategoryMap] = useState<Map<string, string>>(new Map());
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    status: "all",
    lang: "2",
    sync: "all",
    category: "all",
    image: "all",
  });
  const limit = 25;

  useEffect(() => {
    fetch("/api/prestashop/categories?limit=200")
      .then((r) => r.json())
      .then((json) => {
        const cats = json.data ?? [];
        setCategories(cats);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const map = new Map<string, string>();
    categories.forEach((c: Category) => {
      const name = c.name?.find((n: { id: string; value: string }) => n.id === filters.lang)?.value ?? c.name?.[0]?.value ?? "";
      map.set(String(c.id), name);
    });
    setCategoryMap(map);
  }, [filters.lang, categories]);

  useEffect(() => {
    fetch("/api/mapping?resourceType=product&limit=5000")
      .then((r) => r.json())
      .then((json) => {
        const map = new Map<number, SyncMapping>();
        (json.data ?? []).forEach((m: SyncMapping) => map.set(m.psId, m));
        setSyncMap(map);
      })
      .catch(() => {});
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (filters.search) params.set("search", filters.search);
    const res = await fetch(`/api/prestashop/products?${params}`);
    const json = await res.json();
    setProducts(json.data ?? []);
    setLoading(false);
  }, [offset, filters.search]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  function getName(product: PSProductRow) {
    return product.name?.find((n) => n.id === filters.lang)?.value ?? product.name?.[0]?.value ?? "—";
  }

  function getImageUrl(product: PSProductRow): string | null {
    const imgId = product.id_default_image;
    if (!imgId || imgId === "0") return null;
    return `/api/prestashop/images/${product.id}/${imgId}`;
  }

  function hasImages(product: PSProductRow): boolean {
    return !!(product.id_default_image && product.id_default_image !== "0");
  }

  const filtered = products.filter((p) => {
    if (filters.status === "active" && p.active !== "1") return false;
    if (filters.status === "inactive" && p.active !== "0") return false;
    if (filters.sync === "synced" && !syncMap.has(p.id)) return false;
    if (filters.sync === "not_synced" && syncMap.has(p.id)) return false;
    if (filters.sync === "error" && syncMap.get(p.id)?.syncStatus !== "error") return false;
    if (filters.category !== "all" && p.id_category_default !== filters.category) return false;
    if (filters.image === "with" && !hasImages(p)) return false;
    if (filters.image === "without" && hasImages(p)) return false;
    return true;
  });

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  }

  const categoryOptions = categories
    .map((c) => ({
      id: c.id,
      name: c.name?.find((n) => n.id === filters.lang)?.value ?? c.name?.[0]?.value ?? "",
    }))
    .filter((c) => c.name && c.name !== "Root" && c.name !== "Racine")
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <ProductFilters
        filters={filters}
        onChange={setFilters}
        onApply={fetchProducts}
        categories={categoryOptions}
      />

      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{selected.size} sélectionné(s)</span>
          <Button size="sm" onClick={() => {
            const ids = Array.from(selected);
            fetch("/api/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ resourceType: "products", shop: "maison-du-savon-ca.myshopify.com", psIds: ids }),
            });
          }}>
            Sync selected to Shopify
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 w-8">
                <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} />
              </th>
              <th className="p-3 text-left w-12">Image</th>
              <th className="p-3 text-left">Nom</th>
              <th className="p-3 text-left">Réf</th>
              <th className="p-3 text-left">Prix</th>
              <th className="p-3 text-left">Catégorie</th>
              <th className="p-3 text-left">Statut</th>
              <th className="p-3 text-left">Sync</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="p-3" colSpan={8}><Skeleton className="h-8 w-full" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-3 text-center text-muted-foreground">Aucun produit trouvé</td></tr>
            ) : filtered.map((p) => {
              const imgUrl = getImageUrl(p);
              const sync = syncMap.get(p.id);
              const catName = categoryMap.get(p.id_category_default) ?? "—";

              return (
                <tr key={p.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => onSelectProduct(p)}>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                  </td>
                  <td className="p-3">
                    {imgUrl ? (
                      <img src={imgUrl} alt="" className="w-9 h-9 rounded object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">—</div>
                    )}
                  </td>
                  <td className="p-3 font-medium">{getName(p)}</td>
                  <td className="p-3 font-mono text-xs">{p.reference}</td>
                  <td className="p-3">{parseFloat(p.price).toFixed(2)} $</td>
                  <td className="p-3 text-xs">{catName}</td>
                  <td className="p-3">
                    <Badge variant={p.active === "1" ? "default" : "secondary"}>
                      {p.active === "1" ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {sync ? (
                      <Badge variant={sync.syncStatus === "error" ? "destructive" : "default"}>
                        {sync.syncStatus === "synced" ? "✓ Synced" : sync.syncStatus === "error" ? "Erreur" : sync.syncStatus}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between mt-4">
        <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Précédent</Button>
        <span className="text-sm text-muted-foreground">{offset + 1}–{offset + filtered.length} sur {products.length}+ produits</span>
        <Button variant="outline" disabled={products.length < limit} onClick={() => setOffset(offset + limit)}>Suivant</Button>
      </div>
    </div>
  );
}
