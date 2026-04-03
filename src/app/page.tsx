import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [totalMappings, recentLogs, errorCount] = await Promise.all([
    prisma.idMapping.count(),
    prisma.syncLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.syncLog.count({ where: { action: "error" } }),
  ]);

  const syncedProducts = await prisma.idMapping.count({ where: { resourceType: "product" } });
  const syncedCustomers = await prisma.idMapping.count({ where: { resourceType: "customer" } });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Overview</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Synced</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalMappings}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Products</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{syncedProducts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{syncedCustomers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive">{errorCount}</p>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">PS ID</th>
              <th className="p-3 text-left">Action</th>
              <th className="p-3 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {recentLogs.map((log) => (
              <tr key={log.id} className="border-b">
                <td className="p-3">{log.resourceType}</td>
                <td className="p-3">{log.psId}</td>
                <td className="p-3">
                  <span className={
                    log.action === "error" ? "text-destructive" :
                    log.action === "create" ? "text-green-600" :
                    log.action === "update" ? "text-blue-600" :
                    "text-muted-foreground"
                  }>
                    {log.action}
                  </span>
                </td>
                <td className="p-3 text-muted-foreground">
                  {log.createdAt.toLocaleString()}
                </td>
              </tr>
            ))}
            {recentLogs.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>
                  No sync activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
