import { CustomerTable } from "@/components/prestashop/customer-table";

export default function CustomersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">PrestaShop Customers</h1>
      <CustomerTable />
    </div>
  );
}
