import { NextRequest, NextResponse } from "next/server";
import { getPSConnector } from "@/lib/prestashop/registry";
import type { PSResourceType } from "@/lib/prestashop/types";

const VALID_RESOURCES: PSResourceType[] = [
  "products", "categories", "customers", "addresses",
  "orders", "stock_availables", "combinations",
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> }
) {
  const { resource } = await params;

  if (!VALID_RESOURCES.includes(resource as PSResourceType)) {
    return NextResponse.json({ error: `Invalid resource: ${resource}` }, { status: 400 });
  }

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get("id");
  const search = searchParams.get("search");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const connector = getPSConnector();

  try {
    if (id) {
      const item = await connector.get(resource as PSResourceType, parseInt(id));
      return NextResponse.json(item);
    }

    if (search) {
      const results = await connector.search(resource as PSResourceType, search);
      return NextResponse.json({ data: results, total: results.length });
    }

    const results = await connector.list(resource as PSResourceType, { limit, offset });
    return NextResponse.json({ data: results, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
