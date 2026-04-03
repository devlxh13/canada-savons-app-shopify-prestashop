import { ProductTable } from "@/components/prestashop/product-table";

export default function ProductsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">PrestaShop Products</h1>
      <ProductTable />
    </div>
  );
}
