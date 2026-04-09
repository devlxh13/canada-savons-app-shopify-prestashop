import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface KPICardsProps {
  totalSynced: number;
  products: number;
  customers: number;
  orders: number;
  errors24h: number;
}

export function KPICards({ totalSynced, products, customers, orders, errors24h }: KPICardsProps) {
  const cards = [
    { title: "Total synchronisé", value: totalSynced },
    { title: "Produits", value: products },
    { title: "Clients", value: customers },
    { title: "Commandes", value: orders },
    { title: "Erreurs (24h)", value: errors24h, isError: true },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card key={card.title} size="sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{card.value}</span>
              {card.isError && card.value > 0 && (
                <Badge variant="destructive">{card.value}</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
