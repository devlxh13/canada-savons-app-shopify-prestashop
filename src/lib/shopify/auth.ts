import "@shopify/shopify-api/adapters/node";
import { shopifyApi, ApiVersion } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { prisma } from "@/lib/db";

export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: [
    "write_products", "read_products",
    "write_customers", "read_customers",
    "write_orders", "read_orders",
    "write_inventory", "read_inventory",
    "write_files", "read_files",
  ],
  hostName: process.env.SHOPIFY_APP_URL!.replace(/^https?:\/\//, ""),
  apiVersion: ApiVersion.April26,
  isEmbeddedApp: false,
});

export const sessionStorage = new PrismaSessionStorage(prisma);

export async function getSessionForShop(shop: string) {
  const sessions = await prisma.session.findMany({
    where: { shop, isOnline: false },
    orderBy: { expires: "desc" },
  });
  return sessions[0] ?? null;
}
