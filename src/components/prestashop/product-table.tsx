"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductFilters, type FilterState } from "./product-filters";

interface Product {
  psId: number;
  reference: string | null;
  active: boolean;
  nameFr: string | null;
  priceHT: number;
  categoryDefault: string | null;
  categoryTags: string[];
  imageDefault: number | null;
}

interface ProductTableProps {
  onSelectProduct: (product: { psId: number }) => void;
}

export function ProductTable({ onSelectProduct }: ProductTableProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    status: "all",
    category: "all",
    image: "all",
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
    if (filters.image !== "all") params.set("image", filters.image);

    const res = await fetch(`/api/products?${params}`);
    const json = await res.json();
    setProducts(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [offset, filters.search, filters.status, filters.category, filters.image]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  function getImageUrl(product: Product): string | null {
    if (!product.imageDefault) return null;
    return `/api/prestashop/images/${product.psId}/${product.imageDefault}`;
  }

  return (
    <div>
      <ProductFilters
        filters={filters}
        onChange={setFilters}
        onApply={fetchProducts}
        categories={[]}
      />

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left w-12">Image</th>
              <th className="p-3 text-left">Nom</th>
              <th className="p-3 text-left">Réf</th>
              <th className="p-3 text-left">Prix HT</th>
              <th className="p-3 text-left">Catégories</th>
              <th className="p-3 text-left">Statut</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="p-3" colSpan={6}>
                    <Skeleton className="h-8 w-full" />
                  </td>
                </tr>
              ))
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-3 text-center text-muted-foreground">
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
                    onClick={() => onSelectProduct({ psId: p.psId })}
                  >
                    <td className="p-3">
                      {imgUrl ? (
                        <img src={imgUrl} alt="" className="w-9 h-9 rounded object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                          —
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-medium">{p.nameFr || "—"}</td>
                    <td className="p-3 font-mono text-xs">{p.reference || "—"}</td>
                    <td className="p-3">{p.priceHT.toFixed(2)} $</td>
                    <td className="p-3 text-xs max-w-[150px] truncate">
                      {p.categoryTags.length > 0 ? p.categoryTags.join(", ") : "—"}
                    </td>
                    <td className="p-3">
                      <Badge variant={p.active ? "default" : "secondary"}>
                        {p.active ? "Actif" : "Inactif"}
                      </Badge>
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
          {total > 0 ? `${offset + 1}–${Math.min(offset + limit, total)} sur ${total} produits` : "0 produits"}
        </span>
        <Button variant="outline" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
          Suivant
        </Button>
      </div>
    </div>
  );
}
