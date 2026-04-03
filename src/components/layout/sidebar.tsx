"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Overview", href: "/" },
  { label: "Products", href: "/prestashop/products" },
  { label: "Customers", href: "/prestashop/customers" },
  { label: "Orders", href: "/prestashop/orders" },
  { label: "Sync", href: "/sync" },
  { label: "Mapping", href: "/mapping" },
  { label: "Logs", href: "/logs" },
  { label: "Settings", href: "/settings" },
];

function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const shop = searchParams.get("shop");
  const host = searchParams.get("host");
  const extraParams = shop && host ? `?shop=${shop}&host=${host}` : "";

  return (
    <nav className="space-y-1">
      {nav.map((item) => (
        <Link
          key={item.href}
          href={`${item.href}${extraParams}`}
          className={cn(
            "block rounded-md px-3 py-2 text-sm transition-colors",
            pathname === item.href
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="w-64 border-r bg-muted/40 p-4">
      <div className="mb-8">
        <h1 className="text-lg font-bold">Canada Savons</h1>
        <p className="text-xs text-muted-foreground">PS → Shopify Gateway</p>
      </div>
      <Suspense fallback={<nav className="space-y-1" />}>
        <SidebarNav />
      </Suspense>
    </aside>
  );
}
