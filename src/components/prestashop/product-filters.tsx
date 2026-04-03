"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface FilterState {
  search: string;
  status: "all" | "active" | "inactive";
  lang: "1" | "2";
  sync: "all" | "synced" | "not_synced" | "error";
  category: string;
  image: "all" | "with" | "without";
}

interface ProductFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onApply: () => void;
  categories: { id: number; name: string }[];
}

export type { FilterState };

export function ProductFilters({ filters, onChange, onApply, categories }: ProductFiltersProps) {
  function set<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4 items-end">
      <div>
        <label className="text-xs text-muted-foreground">Statut</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.status}
          onChange={(e) => set("status", e.target.value as FilterState["status"])}
        >
          <option value="all">Tous</option>
          <option value="active">Actif</option>
          <option value="inactive">Inactif</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Langue</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.lang}
          onChange={(e) => set("lang", e.target.value as FilterState["lang"])}
        >
          <option value="2">English</option>
          <option value="1">Français</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Sync</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.sync}
          onChange={(e) => set("sync", e.target.value as FilterState["sync"])}
        >
          <option value="all">Tous</option>
          <option value="synced">Synced</option>
          <option value="not_synced">Non synced</option>
          <option value="error">Erreur</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Catégorie</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.category}
          onChange={(e) => set("category", e.target.value)}
        >
          <option value="all">Toutes</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Image</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.image}
          onChange={(e) => set("image", e.target.value as FilterState["image"])}
        >
          <option value="all">Tous</option>
          <option value="with">Avec image</option>
          <option value="without">Sans image</option>
        </select>
      </div>

      <div className="flex-1 min-w-[200px]">
        <label className="text-xs text-muted-foreground">Recherche</label>
        <div className="flex gap-2">
          <Input
            placeholder="Rechercher un produit..."
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onApply()}
          />
          <Button onClick={onApply}>Filtrer</Button>
        </div>
      </div>
    </div>
  );
}
