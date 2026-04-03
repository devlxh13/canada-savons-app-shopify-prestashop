# Enriched Product Page — Design Spec

**Date:** 2026-04-03
**Project:** CANADA - Shopify Savons
**Depends on:** Original gateway spec (2026-04-03-prestashop-shopify-gateway-design.md)

## Overview

Enrich the dashboard product browsing page with images, sync status, filters, and a detail panel. Replaces the current basic table with a full-featured product browser.

## Filter Bar

5 filters + text search, displayed as a horizontal bar above the table:

| Filter | Type | Options |
|--------|------|---------|
| Statut | Select | Tous / Actif / Inactif |
| Langue | Select | FR / EN — controls which language is displayed for name/description in the table |
| Sync | Select | Tous / Synced / Non synced / Erreur |
| Catégorie | Select | Dropdown populated from PS categories API |
| Image | Select | Tous / Avec image / Sans image |
| Recherche | Text input | Free text search on product name |

Filters are applied client-side where possible (language switch) or via API query params. The filter bar is sticky at the top of the content area.

## Enriched Table

Columns:

| Column | Content |
|--------|---------|
| ☐ | Checkbox for multi-select |
| Image | 36x36px thumbnail from PS (via image proxy) |
| Nom | Product name in the selected language |
| Réf | Product reference (monospace) |
| Prix | Price formatted with $ |
| Catégorie | Default category name |
| Statut | Badge: Active (green) / Inactive (grey) |
| Sync | Badge: Synced (blue) / — / Error (red) |

Features:
- Checkbox selection for batch operations
- "Sync selected to Shopify" button appears when items are selected
- Click on a row opens the detail panel
- Pagination (25 per page)
- Sort by column (at least ID, name, price)

## Detail Panel

A slide-in panel (~400px wide) on the right side, triggered by clicking a table row. Contains:

1. **Image gallery** — Large product image. If multiple images, navigation arrows or thumbnails to browse.
2. **Name** — FR and EN side by side
3. **Short description** — FR and EN side by side
4. **Product info** — Price, Reference, EAN13, Weight
5. **Stock** — Available quantity from `stock_availables` API
6. **Variants/Combinations** — Table with columns: Name, Price, Stock, SKU. Fetched from PS `combinations` API.
7. **Categories** — List of associated category names
8. **Status** — Active/Inactive badge
9. **Sync status** — Synced/Not synced/Error. If synced: link to Shopify admin product page + last sync date.
10. **Action button** — "Sync this product" (or "Re-sync" if already synced)

The panel can be closed by clicking outside, pressing Escape, or clicking a close button.

## Image Proxy Route

PrestaShop images require API key authentication. A new API route proxies images:

**Route:** `GET /api/prestashop/images/[productId]/[imageId]`

Behavior:
- Fetches `https://maison-savon-marseille.ca/api/images/products/{productId}/{imageId}` with PS API key auth
- Returns the image binary with correct content-type
- Caches with appropriate headers (images rarely change)

## Data Requirements

### Categories lookup

To display category names in the table, we need a categories map. Options:
- Fetch all categories once on page load and cache client-side
- The PS connector already supports `categories` resource

### Sync status per product

To show sync badges in the table, we need the mapping data:
- Fetch `id_mapping` entries for resource_type "product" via `/api/mapping?resourceType=product`
- Build a client-side lookup map `psId → { syncStatus, shopifyGid, lastSyncedAt }`

### Stock data

For the detail panel:
- Fetch stock via PS API `stock_availables` filtered by product ID
- Or fetch from the full product response (`associations.stock_availables`)

### Combinations/Variants

For the detail panel:
- Fetch combinations via PS API filtered by product ID
- Each combination has: reference, price impact, stock, attributes

## Files to Create/Modify

- Modify: `src/components/prestashop/product-table.tsx` — Complete rewrite with filters, enriched columns, checkbox selection
- Create: `src/components/prestashop/product-detail-panel.tsx` — Slide-in detail panel
- Create: `src/components/prestashop/product-filters.tsx` — Filter bar component
- Create: `src/app/api/prestashop/images/[productId]/[imageId]/route.ts` — Image proxy route
- Modify: `src/app/(dashboard)/prestashop/products/page.tsx` — Wire up new components

## Out of Scope

- Editing product data in PrestaShop (read-only)
- Bulk editing in Shopify from the detail panel
- Product comparison view
- Export to CSV
