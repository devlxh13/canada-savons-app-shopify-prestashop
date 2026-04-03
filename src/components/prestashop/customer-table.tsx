"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PSCustomerRow {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  date_add: string;
}

export function CustomerTable() {
  const [customers, setCustomers] = useState<PSCustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  async function fetchCustomers() {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/prestashop/customers?${params}`);
    const json = await res.json();
    setCustomers(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchCustomers(); }, [offset]);

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <Input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fetchCustomers()} />
        <Button onClick={fetchCustomers}>Search</Button>
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">ID</th>
              <th className="p-3 text-left">First Name</th>
              <th className="p-3 text-left">Last Name</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Date Added</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">Loading...</td></tr>
            ) : customers.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="p-3">{c.id}</td>
                <td className="p-3">{c.firstname}</td>
                <td className="p-3">{c.lastname}</td>
                <td className="p-3">{c.email}</td>
                <td className="p-3 text-muted-foreground text-xs">{c.date_add}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between mt-4">
        <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</Button>
        <span className="text-sm text-muted-foreground">Showing {offset + 1}–{offset + customers.length}</span>
        <Button variant="outline" disabled={customers.length < limit} onClick={() => setOffset(offset + limit)}>Next</Button>
      </div>
    </div>
  );
}
