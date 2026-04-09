# Design Spec — Tests, Retry, Dashboard & Cron configurable

**Date**: 2026-04-09
**Approche**: Incrémentale (couche par couche)

---

## 1. Modele de donnees (Prisma)

### 1.1 `RetryQueue` — file d'attente des items echoues

| Champ | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| jobId | String | Job d'origine |
| resourceType | String | product / customer / order |
| psId | String | ID PrestaShop |
| attemptCount | Int | Nb de tentatives (max 3 immediat, max 10 differe) |
| lastError | String | Dernier message d'erreur |
| status | String | pending / retrying / resolved / abandoned |
| nextRetryAt | DateTime | Prochaine tentative planifiee |
| createdAt | DateTime | Premiere erreur |
| updatedAt | DateTime | Derniere tentative |

### 1.2 `CronConfig` — configuration des crons par ressource

| Champ | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| resourceType | String | product / customer / order / inventory (unique) |
| enabled | Boolean | Actif ou non |
| cronExpression | String | Ex: `0 */6 * * *` |
| lastRunAt | DateTime? | Derniere execution |
| nextRunAt | DateTime? | Prochaine execution calculee |
| lastJobId | String? | Dernier jobId lance |

### 1.3 `SyncStat` — stats agregees par jour/ressource

| Champ | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| date | DateTime | Jour (truncated to day) |
| resourceType | String | product / customer / order |
| created | Int | Nb crees |
| updated | Int | Nb mis a jour |
| skipped | Int | Nb ignores (hash match) |
| errors | Int | Nb erreurs |
| durationMs | Int | Duree totale du job en ms |

**Contrainte unique** sur `SyncStat`: `(date, resourceType)` — une seule ligne par jour par ressource, mise a jour par upsert.

---

## 2. Retry Engine

### 2.1 Retry immediat (dans le batch)

Quand un item echoue dans `SyncEngine`:

1. **Tentative 1** — echec -> attente 1s -> retry
2. **Tentative 2** — echec -> attente 3s -> retry
3. **Tentative 3** — echec -> insertion dans `RetryQueue` avec `status: pending`

Formule backoff: `delay = 1000 * 3^(attempt-1)` — soit 1s, 3s, 9s.

Les retries immediats sont transparents: si le retry reussit, le resultat est retourne normalement. Seuls les echecs definitifs (3 tentatives) atterrissent dans la queue.

### 2.2 Retry differe (via cron)

Nouveau endpoint `POST /api/sync/retry`:

1. Query `RetryQueue` ou `status = pending` et `nextRetryAt <= now()`
2. Regroupe par `resourceType`
3. Relance la sync pour chaque item via `SyncEngine`
4. Si succes -> `status: resolved`, mise a jour `IdMapping`
5. Si echec et `attemptCount < 10` -> incremente, recalcule `nextRetryAt`
6. Si `attemptCount >= 10` -> `status: abandoned`

Backoff differe (intervalles entre tentatives):
- Tentatives 4-6: 15 minutes
- Tentatives 7-8: 1 heure
- Tentatives 9-10: 4 heures

### 2.3 Integration

- Le cron retry tourne via le cron dispatcher toutes les 15 minutes
- Le dashboard affiche un badge avec le count `RetryQueue.status = pending` dans le sidebar/header
- Les items `abandoned` sont visibles dans une page `/retry` dediee pour action manuelle (bouton "retry" ou "dismiss")

---

## 3. Cron configurable par ressource

### 3.1 Mecanisme — Cron Dispatcher

Les crons Vercel sont statiques (`vercel.json`). On utilise un **dispatcher unique**:

1. Un seul cron Vercel: `*/15 * * * *` -> `POST /api/sync/cron`
2. Le dispatcher lit la table `CronConfig`
3. Pour chaque ressource ou `enabled = true` et `nextRunAt <= now()`:
   - Lance le sync via fetch interne vers `/api/sync`
   - Met a jour `lastRunAt = now()`, `lastJobId = newJobId`
   - Calcule `nextRunAt` a partir du `cronExpression`
4. Le dispatcher gere aussi le retry queue (appel `/api/sync/retry`)

### 3.2 Mise a jour de `vercel.json`

Remplacer le cron existant par:

```json
{
  "crons": [
    {
      "path": "/api/sync/cron",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

### 3.3 API routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/settings/cron` | Retourne toutes les configs |
| PUT | `/api/settings/cron/[resourceType]` | Met a jour frequence / enabled |
| POST | `/api/settings/cron/[resourceType]/run` | Execution manuelle immediate |

### 3.4 Page Settings — UI

Tableau avec une ligne par ressource:

| Ressource | Frequence | Actif | Derniere execution | Prochaine | Action |
|-----------|-----------|-------|--------------------|-----------|--------|
| Produits | Toutes les 6h | toggle | 09/04 06:00 | 09/04 12:00 | Run now |
| Inventaire | Toutes les 2h | toggle | 09/04 10:00 | 09/04 12:00 | Run now |
| Clients | 1x/jour | toggle | 09/04 07:00 | 10/04 07:00 | Run now |
| Commandes | 1x/jour | toggle | — | — | Run now |
| Retry | Toutes les 15min | auto | auto | auto | — |

Frequences disponibles dans un select: `15min | 30min | 1h | 2h | 4h | 6h | 12h | 1x/jour`

Pas de saisie libre — le cron expression est genere automatiquement a partir du choix.

### 3.5 Seed initial

A la premiere migration, inserer les configs par defaut:
- products: `0 */6 * * *` (toutes les 6h), enabled
- inventory: `0 */2 * * *` (toutes les 2h), enabled
- customers: `0 7 * * *` (1x/jour 7h), enabled
- orders: `0 20 * * *` (1x/jour 20h), disabled

---

## 4. Dashboard enrichi

### 4.1 Filtres avances

Barre de filtres commune appliquee aux pages `/logs`, `/mapping`, et `/retry`:

- **Date range picker**: Aujourd'hui / 7j / 30j / Custom
- **Resource type**: All / Products / Customers / Orders
- **Statut**: All / Success / Error / Skipped
- **Recherche texte**: jobId, psId

Implementation: query params dans l'URL, filtrage cote serveur (Prisma where clauses).

### 4.2 Page Overview refonte

**Haut — 5 cartes KPI:**
- Total synced (all time)
- Produits (synced count)
- Clients (synced count)
- Commandes (synced count)
- Erreurs (24h) — badge rouge si > 0

**Milieu — graphique principal (Recharts via shadcn Charts):**
- AreaChart empile: created / updated / skipped / errors par jour
- Toggle par resource type (tabs ou boutons)
- Selecteur de periode: 7j / 30j / 90j
- Source: table `SyncStat`

**Bas — 2 colonnes:**
- **Gauche**: Derniers logs (10 plus recents, filtrable)
- **Droite**: Retry queue resume — pending count, abandoned count, lien vers `/retry`

### 4.3 Vue operationnelle

**Bloc "Scheduled Syncs" (dans Overview ou Settings):**
- Liste les crons actifs: ressource, prochaine execution, dernier statut, duree du dernier run
- Indicateurs visuels:
  - Pastille verte: dernier run OK
  - Pastille orange: erreurs partielles
  - Pastille rouge: echec total
- Bouton "Run now" inline

**Bloc "Retry Queue" (dans Overview):**
- Count par statut: pending / retrying / abandoned
- 5 derniers items en erreur avec psId + message
- Lien vers page `/retry` complete

### 4.4 Nouvelle page `/retry`

Table paginee des items en RetryQueue:
- Colonnes: resourceType, psId, attemptCount, lastError, status, nextRetryAt
- Filtres: status (pending/abandoned), resourceType
- Actions: Retry (relance), Dismiss (status -> abandoned)

### 4.5 Badge notification

Dans le sidebar ou header du dashboard:
- Icone cloche avec compteur des `RetryQueue.status = pending`
- Cliquable -> redirige vers `/retry`
- Rafraichi toutes les 60s via polling ou a chaque navigation

---

## 5. Tests

### 5.1 Unit tests renforces

Etendre les tests existants dans `tests/unit/`:

**Sync:**
- Retry logic: backoff exponentiel, max attempts, transition pending -> abandoned
- Transform: donnees malformees, champs manquants, caracteres speciaux (accents, HTML)
- Hash: donnees nulles, objets vides
- SyncEngine: flux complet create/update/skip/error avec retry

**Cron:**
- Dispatcher: calcul nextRunAt, skip si pas du, detection concurrent
- CronConfig: validation des expressions, toggle enabled

**Stats:**
- Aggregation: compteurs corrects, upsert par jour
- Rollup: pas de double comptage

### 5.2 Tests d'integration

Dans `tests/integration/`, avec mocks HTTP (vitest mocking):

- **sync-flow.test.ts**: fetch PS -> transform -> dedup Shopify -> create/update -> log -> stat
- **retry-flow.test.ts**: echec simule -> 3 retries immediats -> insertion RetryQueue -> retry differe -> resolution
- **cron-dispatch.test.ts**: config en base -> dispatch correct -> mise a jour nextRunAt

### 5.3 E2E (Playwright)

Dans `tests/e2e/`:

- **overview.spec.ts**: cartes KPI affichees, graphique rend sans erreur
- **sync.spec.ts**: lancer un sync, voir le job tracker se mettre a jour
- **settings.spec.ts**: modifier une frequence de cron, toggle enabled/disabled
- **logs.spec.ts**: appliquer des filtres date + resource type, verifier resultats
- **retry.spec.ts**: voir les items en erreur, bouton retry manuel

### 5.4 Structure

```
tests/
├── unit/
│   ├── sync/          (engine, hash, transform, retry)
│   ├── cron/          (dispatcher, config)
│   └── stats/         (aggregation)
├── integration/
│   ├── sync-flow.test.ts
│   ├── retry-flow.test.ts
│   └── cron-dispatch.test.ts
└── e2e/
    ├── overview.spec.ts
    ├── sync.spec.ts
    ├── settings.spec.ts
    ├── logs.spec.ts
    └── retry.spec.ts
```

---

## 6. Ordre d'implementation (approche incrementale)

### Phase 1 — Fondations
1. Migration Prisma (RetryQueue, CronConfig, SyncStat)
2. Seed CronConfig avec valeurs par defaut
3. Unit tests pour les nouveaux modeles

### Phase 2 — Retry Engine
4. Retry immediat dans SyncEngine (backoff 3 tentatives)
5. Endpoint `/api/sync/retry` pour retry differe
6. Unit + integration tests retry

### Phase 3 — Cron Dispatcher
7. Endpoint `/api/sync/cron` (dispatcher)
8. API routes `/api/settings/cron/...`
9. Mise a jour `vercel.json`
10. Unit + integration tests cron

### Phase 4 — Dashboard
11. Composants filtres (date range, resource type, status)
12. Aggregation SyncStat dans le sync engine
13. Refonte Overview (KPI + graphique Recharts + blocs operationnels)
14. Page `/retry`
15. Page Settings (config cron)
16. Badge notification retry
17. Filtres sur `/logs` et `/mapping`

### Phase 5 — E2E Tests
18. Setup Playwright
19. Scenarios E2E

### Phase 6 — Stabilisation
20. Tests en staging, fix des bugs
21. Deploy production
