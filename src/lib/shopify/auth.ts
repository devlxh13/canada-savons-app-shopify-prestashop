import "@shopify/shopify-api/adapters/node";
import { shopifyApi, ApiVersion } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { prisma } from "@/lib/db";

let _shopify: ReturnType<typeof shopifyApi> | null = null;

export function getShopifyApi() {
  if (_shopify) return _shopify;
  _shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY!,
    apiSecretKey: process.env.SHOPIFY_API_SECRET!,
    scopes: [
      "write_products", "read_products",
      "write_customers", "read_customers",
      "write_orders", "read_orders",
      "write_inventory", "read_inventory",
      "write_files", "read_files",
    ],
    hostName: process.env.SHOPIFY_APP_URL!.trim().replace(/^https?:\/\//, ""),
    apiVersion: ApiVersion.April26,
    isEmbeddedApp: false,
  });
  return _shopify;
}

// Keep backward compat as a getter
export const shopify = new Proxy({} as ReturnType<typeof shopifyApi>, {
  get(_, prop) {
    return (getShopifyApi() as any)[prop];
  },
});

export const sessionStorage = new PrismaSessionStorage(prisma);

export async function getSessionForShop(shop: string) {
  const sessions = await prisma.session.findMany({
    where: { shop, isOnline: false },
    orderBy: { expires: "desc" },
  });
  return sessions[0] ?? null;
}
