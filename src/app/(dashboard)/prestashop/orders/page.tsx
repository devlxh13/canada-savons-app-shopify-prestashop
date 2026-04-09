"use client";

import { useState } from "react";
import { OrderTable } from "@/components/prestashop/order-table";
import { OrderDetailPanel } from "@/components/prestashop/order-detail-panel";

export default function OrdersPage() {
  const [selectedPsId, setSelectedPsId] = useState<number | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Commandes PrestaShop</h1>
      </div>
      <OrderTable onSelectOrder={(o) => setSelectedPsId(o.psId)} />
      {selectedPsId && (
        <OrderDetailPanel psId={selectedPsId} onClose={() => setSelectedPsId(null)} />
      )}
    </div>
  );
}
