"use client";

import { useState } from "react";
import { ProductTable } from "@/components/prestashop/product-table";
import { ProductDetailPanel } from "@/components/prestashop/product-detail-panel";

export default function ProductsPage() {
  const [selectedPsId, setSelectedPsId] = useState<number | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Produits PrestaShop</h1>
      </div>

      <ProductTable
        onSelectProduct={(p) => setSelectedPsId(p.psId)}
      />

      {selectedPsId && (
        <ProductDetailPanel
          psId={selectedPsId}
          onClose={() => setSelectedPsId(null)}
        />
      )}
    </div>
  );
}
