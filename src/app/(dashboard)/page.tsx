import { prisma } from "@/lib/db";
import { KPICards } from "@/components/dashboard/kpi-cards";
import { SyncChart } from "@/components/dashboard/sync-chart";
import { ScheduledSyncs } from "@/components/dashboard/scheduled-syncs";
import { RetrySummary } from "@/components/dashboard/retry-summary";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    totalProducts,
    totalCustomers,
    totalOrders,
    totalSynced,
    errors24h,
    recentLogs,
  ] = await Promise.all([
    (prisma as any).idMapping.count({ where: { resourceType: "product", syncStatus: "synced" } }),
    (prisma as any).idMapping.count({ where: { resourceType: "customer", syncStatus: "synced" } }),
    (prisma as any).idMapping.count({ where: { resourceType: "order", syncStatus: "synced" } }),
    (prisma as any).idMapping.count({ where: { syncStatus: "synced" } }),
    (prisma as any).syncLog.count({ where: { action: "error", createdAt: { gte: yesterday } } }),
    (prisma as any).syncLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Vue d&apos;ensemble</h1>

      <KPICards
        totalSynced={totalSynced}
        products={totalProducts}
        customers={totalCustomers}
        orders={totalOrders}
        errors24h={errors24h}
      />

      <SyncChart />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ScheduledSyncs />
        <RetrySummary />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Activit&eacute; r&eacute;cente</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="pb-2">Job</th>
              <th className="pb-2">Type</th>
              <th className="pb-2">PS ID</th>
              <th className="pb-2">Action</th>
              <th className="pb-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {recentLogs.map((log: any) => (
              <tr key={log.id} className="border-b">
                <td className="py-2 font-mono text-xs">{log.jobId?.slice(0, 8)}...</td>
                <td>{log.resourceType}</td>
                <td>{log.psId}</td>
                <td>
                  <span className={
                    log.action === "error" ? "text-red-500" :
                    log.action === "create" ? "text-green-500" :
                    log.action === "update" ? "text-blue-500" :
                    "text-muted-foreground"
                  }>
                    {log.action}
                  </span>
                </td>
                <td className="text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString("fr-CA")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
