"use client";

import { useState } from "react";
import { columnFilterOptions, matchesColumnFilter, type ColumnFilterConfig } from "@/components/ui/table-column-filter";

export function useTableColumnFilters<Row, Key extends string>(
  rows: Row[],
  columns: Record<Key, (row: Row) => string>,
  initialFilters: Partial<Record<Key, ColumnFilterConfig>> = {},
) {
  const [filters, setFilters] = useState(initialFilters);
  const activeFilters = (Object.keys(columns) as Key[]).flatMap((key) => {
    const filter = filters[key];
    return filter ? [{ getValue: columns[key], filter }] : [];
  });
  const filteredRows = activeFilters.length
    ? rows.filter((row) => activeFilters.every(({ getValue, filter }) => matchesColumnFilter(getValue(row), filter)))
    : rows;

  return {
    rows: filteredRows,
    active: activeFilters.length > 0,
    reset: () => setFilters({}),
    bind: (key: Key, onChange: () => void) => ({
      getValues: () => columnFilterOptions(rows, columns[key]),
      activeFilter: filters[key],
      isActive: !!filters[key],
      onApply: (filter: ColumnFilterConfig | null) => {
        setFilters((previous) => {
          const next = { ...previous };
          if (filter) next[key] = filter;
          else delete next[key];
          return next;
        });
        onChange();
      },
    }),
  };
}
