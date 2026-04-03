import { OrderTable } from "@/components/prestashop/order-table";

export default function OrdersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">PrestaShop Orders</h1>
      <OrderTable />
    </div>
  );
}
