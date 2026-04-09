"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface OrderRow {
  productId: number;
  productName: string;
  productQuantity: number;
  productPrice: string;
}

interface OrderDetail {
  psId: number;
  reference: string;
  dateAdd: string;
  currentState: string;
  payment: string;
  totalProducts: string;
  totalShipping: string;
  totalPaidTaxIncl: string;
  totalPaidTaxExcl: string;
  customer: {
    id: number;
    firstname: string;
    lastname: string;
    email: string;
  } | null;
  orderRows: OrderRow[];
}

interface OrderDetailPanelProps {
  psId: number;
  onClose: () => void;
}

export function OrderDetailPanel({ psId, onClose }: OrderDetailPanelProps) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setOrder(null);

    fetch(`/api/orders/${psId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setOrder(null);
        } else {
          setOrder(data);
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
          <span className="text-sm font-semibold">Commande #{psId}</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>

        {loading ? (
          <div className="p-4 space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : order ? (
          <div className="p-4 space-y-6">
            {/* En-tête */}
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">{order.reference}</h3>
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant="secondary">{order.payment}</Badge>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  <span className="text-xs font-medium text-muted-foreground">Date : </span>
                  {order.dateAdd}
                </p>
                <p>
                  <span className="text-xs font-medium text-muted-foreground">Statut : </span>
                  {order.currentState}
                </p>
              </div>
            </div>

            {/* Client */}
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Client</span>
              {order.customer ? (
                <div className="mt-1 text-sm">
                  <p className="font-medium">{order.customer.firstname} {order.customer.lastname}</p>
                  <p className="text-muted-foreground">{order.customer.email}</p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Client inconnu</p>
              )}
            </div>

            {/* Lignes de commande */}
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lignes de commande</span>
              <div className="mt-2 rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left text-xs">Produit</th>
                      <th className="p-2 text-right text-xs">Qté</th>
                      <th className="p-2 text-right text-xs">Prix unit.</th>
                      <th className="p-2 text-right text-xs">Sous-total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.orderRows.map((row) => {
                      const unitPrice = parseFloat(row.productPrice);
                      const subtotal = unitPrice * row.productQuantity;
                      return (
                        <tr key={row.productId} className="border-b last:border-0">
                          <td className="p-2 text-xs">{row.productName}</td>
                          <td className="p-2 text-right text-xs">{row.productQuantity}</td>
                          <td className="p-2 text-right text-xs">{unitPrice.toFixed(2)} $</td>
                          <td className="p-2 text-right text-xs">{subtotal.toFixed(2)} $</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totaux */}
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Totaux</span>
              <div className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
                <span className="text-muted-foreground">Sous-total produits</span>
                <span className="text-right">{parseFloat(order.totalProducts).toFixed(2)} $</span>
                <span className="text-muted-foreground">Livraison</span>
                <span className="text-right">{parseFloat(order.totalShipping).toFixed(2)} $</span>
                <span className="text-muted-foreground">Taxes</span>
                <span className="text-right">{(parseFloat(order.totalPaidTaxIncl) - parseFloat(order.totalPaidTaxExcl)).toFixed(2)} $</span>
                <span className="font-bold border-t pt-1">Total TTC</span>
                <span className="text-right font-bold border-t pt-1">{parseFloat(order.totalPaidTaxIncl).toFixed(2)} $</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 text-muted-foreground">Commande introuvable</div>
        )}
      </div>
    </div>
  );
}
