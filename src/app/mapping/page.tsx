import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MappingPage() {
  const mappings = await prisma.idMapping.findMany({
    orderBy: { lastSyncedAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">ID Mappings</h1>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">PS ID</th>
              <th className="p-3 text-left">Shopify GID</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Last Synced</th>
            </tr>
          </thead>
          <tbody>
            {mappings.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">No mappings found.</td>
              </tr>
            ) : (
              mappings.map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="p-3">{m.resourceType}</td>
                  <td className="p-3">{m.psId}</td>
                  <td className="p-3 font-mono text-xs">{m.shopifyGid}</td>
                  <td className="p-3">{m.syncStatus}</td>
                  <td className="p-3 text-muted-foreground">{new Date(m.lastSyncedAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
