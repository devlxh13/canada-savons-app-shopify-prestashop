"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

interface CustomerAddress {
  address1: string;
  city: string;
  postcode: string;
  phone: string | null;
  company: string | null;
}

interface CustomerOrder {
  id: number;
  reference: string;
  totalPaid: string;
  dateAdd: string;
  currentState: string;
  payment: string;
}

interface CustomerDetail {
  psId: number;
  firstname: string;
  lastname: string;
  email: string;
  active: boolean;
  dateAdd: string;
  addresses: CustomerAddress[];
  orders: CustomerOrder[];
}

interface CustomerDetailPanelProps {
  psId: number;
  onClose: () => void;
}

export function CustomerDetailPanel({ psId, onClose }: CustomerDetailPanelProps) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setCustomer(null);

    fetch(`/api/customers/${psId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setCustomer(null);
        } else {
          setCustomer(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [psId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-black/50 absolute inset-0" />
      <div
        className="relative w-[420px] bg-background border-l shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background border-b p-3 flex justify-between items-center z-10">
          <span className="text-sm font-semibold">Client #{psId}</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>

        {loading ? (
          <div className="p-4 space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : customer ? (
          <div className="p-4 space-y-6">
            {/* Infos */}
            <div>
              <h3 className="font-semibold text-lg">
                {customer.firstname} {customer.lastname}
              </h3>
              <p className="text-sm text-muted-foreground">{customer.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={customer.active ? "default" : "secondary"}>
                  {customer.active ? "actif" : "inactif"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Inscrit le {customer.dateAdd}
                </span>
              </div>
            </div>

            {/* Adresses */}
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Adresses
              </span>
              {customer.addresses.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-1">Aucune adresse</p>
              ) : (
                <div className="space-y-2 mt-2">
                  {customer.addresses.map((addr, i) => (
                    <Card key={i} className="p-3 text-sm space-y-0.5">
                      <p>{addr.address1}</p>
                      <p>
                        {addr.city}, {addr.postcode}
                      </p>
                      {addr.phone && (
                        <p className="text-muted-foreground">{addr.phone}</p>
                      )}
                      {addr.company && (
                        <p className="text-muted-foreground">{addr.company}</p>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Commandes */}
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Commandes
              </span>
              {customer.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-1">Aucune commande</p>
              ) : (
                <div className="mt-2 rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-2 text-left font-medium">Réf</th>
                        <th className="p-2 text-left font-medium">Date</th>
                        <th className="p-2 text-left font-medium">Montant</th>
                        <th className="p-2 text-left font-medium">Paiement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer.orders.map((order) => (
                        <tr key={order.id} className="border-b last:border-0">
                          <td className="p-2 font-mono">{order.reference}</td>
                          <td className="p-2 text-muted-foreground">{order.dateAdd}</td>
                          <td className="p-2">{order.totalPaid} $</td>
                          <td className="p-2 text-muted-foreground">{order.payment}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 text-muted-foreground">Client introuvable</div>
        )}
      </div>
    </div>
  );
}
