"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PSProductRow {
  id: number;
  name: { id: string; value: string }[];
  price: string;
  active: string;
  reference: string;
  date_upd: string;
}

export function ProductTable() {
  const [products, setProducts] = useState<PSProductRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  async function fetchProducts() {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/prestashop/products?${params}`);
    const json = await res.json();
    setProducts(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchProducts(); }, [offset]);

  function getName(product: PSProductRow, langId: string = "2") {
    return product.name?.find((n) => n.id === langId)?.value ?? product.name?.[0]?.value ?? "—";
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fetchProducts()} />
        <Button onClick={fetchProducts}>Search</Button>
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">ID</th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Reference</th>
              <th className="p-3 text-left">Price</th>
              <th className="p-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">Loading...</td></tr>
            ) : products.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="p-3">{p.id}</td>
                <td className="p-3">{getName(p)}</td>
                <td className="p-3 font-mono text-xs">{p.reference}</td>
                <td className="p-3">{parseFloat(p.price).toFixed(2)} $</td>
                <td className="p-3"><Badge variant={p.active === "1" ? "default" : "secondary"}>{p.active === "1" ? "Active" : "Inactive"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between mt-4">
        <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</Button>
        <span className="text-sm text-muted-foreground">Showing {offset + 1}–{offset + products.length}</span>
        <Button variant="outline" disabled={products.length < limit} onClick={() => setOffset(offset + limit)}>Next</Button>
      </div>
    </div>
  );
}
