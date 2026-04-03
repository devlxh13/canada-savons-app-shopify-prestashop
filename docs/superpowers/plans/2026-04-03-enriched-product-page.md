# Enriched Product Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic product table with a full-featured browser: 5 filters, enriched columns (thumbnail, category, sync status), checkbox multi-select, and a slide-in detail panel with images, descriptions, stock, variants, and sync action.

**Architecture:** Client-side React components consuming existing `/api/prestashop/*` and `/api/mapping` endpoints. New image proxy route for authenticated PS image serving. Detail panel fetches additional data (stock, combinations) on demand.

**Tech Stack:** React, shadcn/ui (Select, Badge, Button, Input, Checkbox, Skeleton), Tailwind CSS, Next.js API routes

---

## File Structure

```
src/
├── app/
│   ├── api/prestashop/images/[productId]/[imageId]/
│   │   └── route.ts                          # NEW — Image proxy
│   └── (dashboard)/prestashop/products/
│       └── page.tsx                           # MODIFY — Wire up new components
├── components/prestashop/
│   ├── product-filters.tsx                    # NEW — Filter bar
│   ├── product-table.tsx                      # REWRITE — Enriched table with checkboxes
│   └── product-detail-panel.tsx               # NEW — Slide-in detail panel
```

---

## Task 1: Image Proxy Route

A server-side route that fetches images from PrestaShop with API key auth and serves them to the browser.

**Files:**
- Create: `src/app/api/prestashop/images/[productId]/[imageId]/route.ts`

- [ ] **Step 1: Create the image proxy route**

Create `src/app/api/prestashop/images/[productId]/[imageId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ productId: string; imageId: string }> }
) {
  const { productId, imageId } = await params;

  const apiUrl = process.env.PRESTASHOP_API_URL;
  const apiKey = process.env.PRESTASHOP_API_KEY;

  if (!apiUrl || !apiKey) {
    return NextResponse.json({ error: "PS API not configured" }, { status: 500 });
  }

  const imageUrl = `${apiUrl}images/products/${productId}/${imageId}`;
  const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;

  const response = await fetch(imageUrl, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    return new NextResponse(null, { status: response.status });
  }

  const imageBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "image/jpeg";

  return new NextResponse(imageBuffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
```

- [ ] **Step 2: Verify locally**

```bash
# Start dev server and test the route
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/prestashop/images/1050/1214"
```

Expected: `200`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/prestashop/images/
git commit -m "feat: add image proxy route for PrestaShop product images"
```

---

## Task 2: Product Filters Component

A horizontal filter bar with 5 dropdowns + search input.

**Files:**
- Create: `src/components/prestashop/product-filters.tsx`

- [ ] **Step 1: Create the filter bar component**

Create `src/components/prestashop/product-filters.tsx`:

```typescript
"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface FilterState {
  search: string;
  status: "all" | "active" | "inactive";
  lang: "1" | "2";
  sync: "all" | "synced" | "not_synced" | "error";
  category: string;
  image: "all" | "with" | "without";
}

interface ProductFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onApply: () => void;
  categories: { id: number; name: string }[];
}

export type { FilterState };

export function ProductFilters({ filters, onChange, onApply, categories }: ProductFiltersProps) {
  function set<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4 items-end">
      <div>
        <label className="text-xs text-muted-foreground">Statut</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.status}
          onChange={(e) => set("status", e.target.value as FilterState["status"])}
        >
          <option value="all">Tous</option>
          <option value="active">Actif</option>
          <option value="inactive">Inactif</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Langue</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.lang}
          onChange={(e) => set("lang", e.target.value as FilterState["lang"])}
        >
          <option value="2">English</option>
          <option value="1">Français</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Sync</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.sync}
          onChange={(e) => set("sync", e.target.value as FilterState["sync"])}
        >
          <option value="all">Tous</option>
          <option value="synced">Synced</option>
          <option value="not_synced">Non synced</option>
          <option value="error">Erreur</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Catégorie</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.category}
          onChange={(e) => set("category", e.target.value)}
        >
          <option value="all">Toutes</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Image</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.image}
          onChange={(e) => set("image", e.target.value as FilterState["image"])}
        >
          <option value="all">Tous</option>
          <option value="with">Avec image</option>
          <option value="without">Sans image</option>
        </select>
      </div>

      <div className="flex-1 min-w-[200px]">
        <label className="text-xs text-muted-foreground">Recherche</label>
        <div className="flex gap-2">
          <Input
            placeholder="Rechercher un produit..."
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onApply()}
          />
          <Button onClick={onApply}>Filtrer</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/prestashop/product-filters.tsx
git commit -m "feat: add product filter bar component"
```

---

## Task 3: Enriched Product Table

Rewrite the product table with thumbnail, category, sync badge, checkboxes, and row click handler.

**Files:**
- Rewrite: `src/components/prestashop/product-table.tsx`

- [ ] **Step 1: Rewrite product-table.tsx**

Replace `src/components/prestashop/product-table.tsx` entirely:

```typescript
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

  // Fetch categories once
  useEffect(() => {
    fetch("/api/prestashop/categories?limit=200")
      .then((r) => r.json())
      .then((json) => {
        const cats = json.data ?? [];
        setCategories(cats);
        const map = new Map<string, string>();
        cats.forEach((c: Category) => {
          const name = c.name?.find((n) => n.id === filters.lang)?.value ?? c.name?.[0]?.value ?? "";
          map.set(String(c.id), name);
        });
        setCategoryMap(map);
      });
  }, []);

  // Update category names when language changes
  useEffect(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => {
      const name = c.name?.find((n) => n.id === filters.lang)?.value ?? c.name?.[0]?.value ?? "";
      map.set(String(c.id), name);
    });
    setCategoryMap(map);
  }, [filters.lang, categories]);

  // Fetch sync mappings once
  useEffect(() => {
    fetch("/api/mapping?resourceType=product&limit=5000")
      .then((r) => r.json())
      .then((json) => {
        const map = new Map<number, SyncMapping>();
        (json.data ?? []).forEach((m: SyncMapping) => map.set(m.psId, m));
        setSyncMap(map);
      });
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

  // Client-side filtering
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
            // Will be wired to sync API
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
                <tr
                  key={p.id}
                  className="border-b hover:bg-muted/30 cursor-pointer"
                  onClick={() => onSelectProduct(p)}
                >
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
        <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
          Précédent
        </Button>
        <span className="text-sm text-muted-foreground">
          {offset + 1}–{offset + filtered.length} sur {products.length}+ produits
        </span>
        <Button variant="outline" disabled={products.length < limit} onClick={() => setOffset(offset + limit)}>
          Suivant
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/prestashop/product-table.tsx
git commit -m "feat: enriched product table with thumbnail, category, sync status, filters, checkboxes"
```

---

## Task 4: Product Detail Panel

Slide-in panel that appears when clicking a product row. Shows images, descriptions FR/EN, info, stock, variants, sync status, and sync action.

**Files:**
- Create: `src/components/prestashop/product-detail-panel.tsx`

- [ ] **Step 1: Create the detail panel component**

Create `src/components/prestashop/product-detail-panel.tsx`:

```typescript
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

    // Fetch product details
    fetch(`/api/prestashop/products?id=${productId}`)
      .then((r) => r.json())
      .then((data) => {
        setProduct(data);
        setLoading(false);

        // Fetch stock for this product
        fetch(`/api/prestashop/stock_availables?filter=${encodeURIComponent(`id_product=${productId}`)}`)
          .then((r) => r.json())
          .then((json) => setStock(json.data ?? []))
          .catch(() => {});

        // Fetch combinations
        const combIds = data?.associations?.product_combinations ?? [];
        if (combIds.length > 0) {
          fetch(`/api/prestashop/combinations?limit=50`)
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
        {/* Close button */}
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
            {/* Image gallery */}
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
                Pas d'image
              </div>
            )}

            {/* Names FR + EN */}
            <div>
              <h3 className="font-semibold text-lg">{getLang(product.name, "2")}</h3>
              <p className="text-sm text-muted-foreground">{getLang(product.name, "1")}</p>
            </div>

            {/* Short descriptions */}
            <div className="space-y-2">
              <div>
                <span className="text-xs font-medium text-muted-foreground">Description (EN)</span>
                <div className="text-sm prose-sm" dangerouslySetInnerHTML={{ __html: getLang(product.description_short, "2") || "<em>—</em>" }} />
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Description (FR)</span>
                <div className="text-sm prose-sm" dangerouslySetInnerHTML={{ __html: getLang(product.description_short, "1") || "<em>—</em>" }} />
              </div>
            </div>

            {/* Product info grid */}
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

            {/* Stock */}
            <div>
              <span className="text-xs text-muted-foreground">Stock disponible</span>
              <p className="text-lg font-bold">{totalStock}</p>
            </div>

            {/* Variants */}
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

            {/* Status */}
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

            {/* Sync info */}
            {syncInfo?.shopifyGid && (
              <div className="text-xs text-muted-foreground">
                <p>Shopify: {syncInfo.shopifyGid}</p>
                <p>Dernière sync: {new Date(syncInfo.lastSyncedAt).toLocaleString()}</p>
              </div>
            )}

            {/* Sync action */}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/prestashop/product-detail-panel.tsx
git commit -m "feat: add product detail slide-in panel with images, stock, variants, sync"
```

---

## Task 5: Wire Up Products Page

Connect all components in the products page.

**Files:**
- Modify: `src/app/(dashboard)/prestashop/products/page.tsx`

- [ ] **Step 1: Update the products page**

Replace `src/app/(dashboard)/prestashop/products/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { ProductTable } from "@/components/prestashop/product-table";
import { ProductDetailPanel } from "@/components/prestashop/product-detail-panel";

interface SelectedProduct {
  id: number;
}

export default function ProductsPage() {
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(null);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">PrestaShop Products</h1>
      <ProductTable onSelectProduct={(p) => setSelectedProduct({ id: p.id })} />
      {selectedProduct && (
        <ProductDetailPanel
          productId={selectedProduct.id}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/\\(dashboard\\)/prestashop/products/page.tsx
git commit -m "feat: wire up enriched product table and detail panel in products page"
```

---

## Task 6: Deploy and Verify

Push changes, deploy to Vercel, verify everything works.

- [ ] **Step 1: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Deploy to Vercel**

```bash
vercel deploy --prod
```

- [ ] **Step 3: Verify on deployed app**

Open the app in Shopify admin or directly. Check:
- Filters render and work (status, language, sync, category, image)
- Thumbnails display in the table
- Sync badges show correctly
- Clicking a product opens the detail panel
- Detail panel shows image(s), descriptions FR/EN, price, stock, variants
- "Sync ce produit" button works
- Checkbox multi-select works with "Sync selected" button

- [ ] **Step 4: Update Linear issue LXH-199 to Done**

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{"query": "mutation { issueUpdate(id: \"<LXH-199-ID>\", input: { stateId: \"<DONE-STATE-ID>\" }) { success } }"}'
```
