"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface FilterState {
  dateRange: string;
  resourceType: string;
  status: string;
  search: string;
}

interface FilterBarProps {
  onFilter: (filters: FilterState) => void;
  showResourceType?: boolean;
  showStatus?: boolean;
}

const DATE_PRESETS = [
  { label: "Aujourd'hui", value: "today" },
  { label: "7j", value: "7d" },
  { label: "30j", value: "30d" },
];

export function FilterBar({ onFilter, showResourceType = true, showStatus = true }: FilterBarProps) {
  const [filters, setFilters] = useState<FilterState>({
    dateRange: "7d",
    resourceType: "all",
    status: "all",
    search: "",
  });

  function update(patch: Partial<FilterState>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    onFilter(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="flex gap-1">
        {DATE_PRESETS.map((p) => (
          <Button
            key={p.value}
            variant={filters.dateRange === p.value ? "default" : "outline"}
            size="sm"
            onClick={() => update({ dateRange: p.value })}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {showResourceType && (
        <select
          className="border rounded px-2 py-1 text-sm"
          value={filters.resourceType}
          onChange={(e) => update({ resourceType: e.target.value })}
        >
          <option value="all">Tous types</option>
          <option value="product">Produits</option>
          <option value="customer">Clients</option>
          <option value="order">Commandes</option>
        </select>
      )}

      {showStatus && (
        <select
          className="border rounded px-2 py-1 text-sm"
          value={filters.status}
          onChange={(e) => update({ status: e.target.value })}
        >
          <option value="all">Tous statuts</option>
          <option value="create">Créé</option>
          <option value="update">Mis à jour</option>
          <option value="skip">Ignoré</option>
          <option value="error">Erreur</option>
        </select>
      )}

      <Input
        placeholder="Rechercher jobId, psId..."
        className="w-48"
        value={filters.search}
        onChange={(e) => update({ search: e.target.value })}
      />
    </div>
  );
}
