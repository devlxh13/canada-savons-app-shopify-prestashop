import { SyncLauncher } from "@/components/sync/sync-launcher";

export default function SyncPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Sync PrestaShop → Shopify</h1>
      <div className="max-w-md">
        <SyncLauncher />
      </div>
    </div>
  );
}
