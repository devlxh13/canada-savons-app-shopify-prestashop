"use client";

import { useState } from "react";
import { CustomerTable } from "@/components/prestashop/customer-table";
import { CustomerDetailPanel } from "@/components/prestashop/customer-detail-panel";

export default function CustomersPage() {
  const [selectedPsId, setSelectedPsId] = useState<number | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Clients PrestaShop</h1>
      </div>
      <CustomerTable onSelectCustomer={(c) => setSelectedPsId(c.psId)} />
      {selectedPsId && (
        <CustomerDetailPanel psId={selectedPsId} onClose={() => setSelectedPsId(null)} />
      )}
    </div>
  );
}
