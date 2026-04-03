import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const logs = await prisma.syncLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Sync Logs</h1>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Job</th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">PS ID</th>
              <th className="p-3 text-left">Action</th>
              <th className="p-3 text-left">Details</th>
              <th className="p-3 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">No logs found.</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b">
                  <td className="p-3 font-mono text-xs">{log.jobId.slice(0, 8)}…</td>
                  <td className="p-3">{log.resourceType}</td>
                  <td className="p-3">{log.psId ?? "—"}</td>
                  <td className="p-3">{log.action}</td>
                  <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">
                    {log.details ? JSON.stringify(log.details) : "—"}
                  </td>
                  <td className="p-3 text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
