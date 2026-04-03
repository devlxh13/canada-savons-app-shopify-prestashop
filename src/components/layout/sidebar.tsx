"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-muted/40 p-4">
      <div className="mb-8">
        <h1 className="text-lg font-bold">Canada Savons</h1>
        <p className="text-xs text-muted-foreground">PS → Shopify Gateway</p>
      </div>
      <nav className="space-y-1">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
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
    </aside>
  );
}
