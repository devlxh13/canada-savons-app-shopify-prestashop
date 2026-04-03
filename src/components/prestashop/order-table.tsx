"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface PSOrderRow {
  id: number;
  reference: string;
  id_customer: string;
  payment: string;
  total_paid: string;
  date_add: string;
}

export function OrderTable() {
  const [orders, setOrders] = useState<PSOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  async function fetchOrders() {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const res = await fetch(`/api/prestashop/orders?${params}`);
    const json = await res.json();
    setOrders(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchOrders(); }, [offset]);

  return (
    <div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">ID</th>
              <th className="p-3 text-left">Reference</th>
              <th className="p-3 text-left">Customer ID</th>
              <th className="p-3 text-left">Payment</th>
              <th className="p-3 text-left">Total Paid</th>
              <th className="p-3 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">Loading...</td></tr>
            ) : orders.map((o) => (
              <tr key={o.id} className="border-b">
                <td className="p-3">{o.id}</td>
                <td className="p-3 font-mono text-xs">{o.reference}</td>
                <td className="p-3">{o.id_customer}</td>
                <td className="p-3">{o.payment}</td>
                <td className="p-3">{parseFloat(o.total_paid).toFixed(2)} $</td>
                <td className="p-3 text-muted-foreground text-xs">{o.date_add}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between mt-4">
        <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</Button>
        <span className="text-sm text-muted-foreground">Showing {offset + 1}–{offset + orders.length}</span>
        <Button variant="outline" disabled={orders.length < limit} onClick={() => setOffset(offset + limit)}>Next</Button>
      </div>
    </div>
  );
}
