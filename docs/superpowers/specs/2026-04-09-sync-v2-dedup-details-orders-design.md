# Sync V2 — Déduplication, Détails, Commandes

**Date:** 2026-04-09
**Statut:** Draft

---

## Contexte

L'app gateway PS → Shopify a besoin de :
1. Panels de détail pour clients et commandes (comme les produits)
2. Sync étendu aux commandes (import historique terminé vers Shopify)
3. Déduplication produits (Shopify déjà peuplé, éviter les doublons)
4. Nettoyage d'Inngest (remplacé par self-chaining batches)

## 1. Détail Client — Panel latéral

### API : `GET /api/customers/[id]`

Fetch en parallèle depuis l'API PrestaShop :
- Customer par ID (infos de base)
- Addresses filtrées par `filter[id_customer]={id}` (display=full)
- Orders filtrées par `filter[id_customer]={id}` (display=full)

**Réponse :**
```json
{
  "psId": 42,
  "firstname": "Jean",
  "lastname": "Dupont",
  "email": "jean@example.com",
  "active": true,
  "dateAdd": "2024-01-15",
  "addresses": [
    { "address1": "123 rue...", "city": "Montréal", "postcode": "H2X", "phone": "514..." }
  ],
  "orders": [
    { "id": 100, "reference": "ABC123", "totalPaid": "45.99", "dateAdd": "2024-03-01", "currentState": "5" }
  ]
}
```

### UI : `ProductDetailPanel` pattern

- Composant `CustomerDetailPanel` dans `src/components/prestashop/customer-detail-panel.tsx`
- Slide-out panel droit (420px), même structure que product detail
- Sections :
  - **Infos** : nom, email, statut actif/inactif, date inscription
  - **Adresses** : cartes empilées (adresse1, ville, code postal, téléphone)
  - **Commandes** : mini-table (référence, date, montant) — cliquable ? Non, trop imbriqué. Juste lecture.

### Page : `src/app/(dashboard)/prestashop/customers/page.tsx`

- Ajouter state `selectedPsId` + `onSelectProduct` callback sur le `CustomerTable`
- Rendre les lignes de la table cliquables (cursor-pointer, hover highlight)

---

## 2. Détail Commande — Panel latéral

### API : `GET /api/orders/[id]`

Fetch en parallèle depuis l'API PrestaShop :
- Order par ID (infos complètes + associations.order_rows)
- Customer par `id_customer` (pour afficher le nom du client)

**Réponse :**
```json
{
  "psId": 100,
  "reference": "ABC123",
  "dateAdd": "2024-03-01",
  "currentState": "5",
  "payment": "PayPal",
  "totalProducts": "38.00",
  "totalShipping": "7.99",
  "totalPaidTaxIncl": "45.99",
  "customer": { "id": 42, "firstname": "Jean", "lastname": "Dupont", "email": "jean@example.com" },
  "orderRows": [
    { "productId": 992, "productName": "Crème Pieds 150ml", "productQuantity": 2, "productPrice": "19.00" }
  ]
}
```

### UI : `OrderDetailPanel`

- Composant `src/components/prestashop/order-detail-panel.tsx`
- Même pattern slide-out
- Sections :
  - **En-tête** : référence, date, statut, mode de paiement
  - **Client** : nom + email (affiché comme lien textuel, pas cliquable)
  - **Lignes** : table (produit, quantité, prix unitaire, sous-total)
  - **Totaux** : sous-total produits, livraison, total TTC

### Page : `src/app/(dashboard)/prestashop/orders/page.tsx`

- Ajouter state + callback comme customers
- Rendre les lignes cliquables

---

## 3. Déduplication Produits — Match SKU puis Titre

### Nouvelle méthode Shopify Client : `findExistingProduct`

```typescript
async findExistingProduct(sku: string, title: string): Promise<string | null>
```

1. **Cherche par SKU** : `products(first: 1, query: "sku:{sku}")` via Shopify GraphQL
2. Si trouvé → retourne le Shopify GID
3. **Sinon, cherche par titre** : `products(first: 1, query: "title:{title}")`
4. Si trouvé → retourne le Shopify GID
5. Sinon → retourne `null`

### Intégration dans le Sync Engine

Dans `syncSingleProduct`, avant de créer :

```
1. Check idMapping (existant) — si trouvé + même hash → skip
2. Si pas de mapping → findExistingProduct(sku, title)
3. Si Shopify produit trouvé :
   a. Stocker le mapping psId ↔ shopifyGid (première réconciliation)
   b. Comparer hash → update si différent, skip si identique
4. Si pas trouvé → create
```

Ce flow garantit :
- Premier sync : match les produits existants dans Shopify
- Syncs suivants : utilise le mapping DB (rapide, pas de recherche Shopify)
- Jamais de doublon

---

## 4. Sync Commandes — Import vers Shopify

### Filtre : commandes terminées uniquement

PrestaShop `current_state` = 5 (Delivered) est le statut "terminé" standard. On filtre sur ce statut (configurable).

### Nouvelle méthode Shopify Client : `createOrder`

```typescript
async createOrder(input: {
  customerId: string;          // Shopify customer GID
  lineItems: {
    variantId: string;         // Shopify variant GID
    quantity: number;
  }[];
  billingAddress: Address;
  shippingAddress: Address;
  financialStatus: "PAID";
  fulfillmentStatus: "FULFILLED";
  note: string;                // "Imported from PrestaShop - Ref: ABC123"
  tags: string[];              // ["prestashop-import"]
}): Promise<{ id: string }>
```

Utilise la mutation GraphQL `orderCreate` (nécessite scope `write_orders`).

### Auto-résolution des dépendances

Pour chaque commande :

1. **Résoudre le client** :
   - Check `idMapping` pour `customer:{id_customer}`
   - Si absent → `syncSingleCustomer(id_customer)` (avec dédup email)
   - Récupérer le `shopifyGid` du client

2. **Résoudre chaque produit des order_rows** :
   - Check `idMapping` pour `product:{product_id}`
   - Si absent → `syncSingleProduct(product_id)` (avec dédup SKU/titre)
   - Récupérer le `shopifyGid` du variant

3. **Résoudre les adresses** :
   - Fetch addresses PS filtrées par `id_customer`
   - Transformer en format Shopify (address1, city, zip, country, phone)

4. **Créer la commande Shopify**

5. **Stocker le mapping** `order:{psId}` ↔ `shopifyGid`

### Déduplication clients

Nouvelle méthode Shopify Client :

```typescript
async findCustomerByEmail(email: string): Promise<string | null>
```

Query : `customers(first: 1, query: "email:{email}")`. Même pattern que produits : check mapping DB d'abord, search Shopify si absent, create si introuvable.

---

## 5. Sync Selector — UI unifiée

### Refonte du Sync Launcher

Remplace le launcher actuel par un sélecteur à 3 onglets :

**Onglet Produits :**
- Bouton "Sync tous les produits"
- Champ optionnel "PS ID" pour sync individuel
- Indicateur : X produits dans Shopify, Y dans PrestaShop

**Onglet Clients :**
- Bouton "Sync tous les clients"
- Champ optionnel "PS ID" pour sync individuel

**Onglet Commandes :**
- Bouton "Sync commandes terminées"
- Champ optionnel "PS ID" pour sync individuel
- Note : "Les clients et produits manquants seront créés automatiquement"

### API unifiée : `POST /api/sync`

Refonte de la route existante (suppression Inngest) :

```json
POST /api/sync
{
  "resourceType": "products" | "customers" | "orders",
  "psIds": [123],        // optionnel — si absent, sync en masse
  "batchSize": 50        // optionnel
}
```

- Individuel (`psIds` fourni) : exécute directement dans la requête, retourne le résultat
- Masse (`psIds` absent) : lance le premier batch, self-chain via `after()` pour les suivants

Plus besoin du param `shop` — la session Shopify est récupérée depuis la DB.

---

## 6. Architecture Sync — Self-chaining (sans Inngest)

### Pattern : identique à `/api/sync/local`

```
POST /api/sync
  → exécute batch 0 (50 items)
  → after() → POST /api/sync?offset=50&jobId=xxx&resourceType=products
    → exécute batch 1
    → after() → POST /api/sync?offset=100&...
      → ...
      → dernier batch → status: completed
```

### Vercel Cron

`vercel.json` existant lance `/api/sync/local` quotidiennement. On ajoute un cron pour le sync Shopify si besoin, ou on le garde manuel uniquement.

### Fichiers à supprimer

- `src/lib/inngest/client.ts`
- `src/lib/inngest/functions.ts`
- `src/app/api/inngest/route.ts`
- Dépendances : `inngest` dans package.json

---

## 7. Schéma Prisma — Extensions

### IdMapping

Pas de changement de schéma — le champ `resourceType` supporte déjà `"order"`. On ajoute juste l'usage avec les valeurs `"product"`, `"customer"`, `"order"`.

### SyncLog

Pas de changement — `resourceType` acceptera `"order"` en plus.

---

## 8. Sync Engine — Refonte

### Fichier : `src/lib/sync/engine.ts`

Méthodes :

| Méthode | Existant | Changement |
|---------|----------|------------|
| `syncSingleProduct(psId, jobId)` | Oui | Ajouter dédup SKU/titre avant create |
| `syncSingleCustomer(psId, jobId)` | Oui | Ajouter dédup email + support update |
| `syncSingleOrder(psId, jobId)` | Non | Nouveau — auto-résolution + orderCreate |

### Transform

Nouveau dans `src/lib/sync/transform.ts` :

```typescript
transformOrder(order: PSOrder, customerGid: string, lineItems: {...}[], addresses: {...}): ShopifyOrderInput
```

---

## Résumé des fichiers impactés

| Action | Fichier |
|--------|---------|
| Créer | `src/app/api/customers/[id]/route.ts` |
| Créer | `src/app/api/orders/[id]/route.ts` |
| Créer | `src/components/prestashop/customer-detail-panel.tsx` |
| Créer | `src/components/prestashop/order-detail-panel.tsx` |
| Modifier | `src/app/(dashboard)/prestashop/customers/page.tsx` |
| Modifier | `src/app/(dashboard)/prestashop/orders/page.tsx` |
| Modifier | `src/components/prestashop/customer-table.tsx` |
| Modifier | `src/components/prestashop/order-table.tsx` |
| Modifier | `src/lib/shopify/client.ts` — ajouter findExistingProduct, findCustomerByEmail, createOrder |
| Modifier | `src/lib/sync/engine.ts` — dédup + syncSingleOrder |
| Modifier | `src/lib/sync/transform.ts` — transformOrder |
| Modifier | `src/app/api/sync/route.ts` — supprimer Inngest, self-chaining |
| Modifier | `src/components/sync/sync-launcher.tsx` — sélecteur 3 onglets |
| Supprimer | `src/lib/inngest/client.ts` |
| Supprimer | `src/lib/inngest/functions.ts` |
| Supprimer | `src/app/api/inngest/route.ts` |
| Modifier | `package.json` — supprimer inngest |
