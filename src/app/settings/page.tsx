"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="space-y-6 max-w-lg">
        <Card>
          <CardHeader><CardTitle>Shopify Connection</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Store: maison-du-savon-ca.myshopify.com</p>
            <Button asChild>
              <a href="/api/auth/shopify?shop=maison-du-savon-ca.myshopify.com">Connect to Shopify</a>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>PrestaShop</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">API and database connections are configured via environment variables on Vercel.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
