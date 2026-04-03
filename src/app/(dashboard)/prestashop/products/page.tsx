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
