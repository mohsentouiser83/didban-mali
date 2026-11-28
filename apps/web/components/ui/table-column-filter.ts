import { asciiDigits } from "@/lib/utils";

export interface ColumnFilterConfig {
  selectedValues?: Set<string>;
  textCondition?: string;
}

function normalize(value: string) {
  return asciiDigits(value).replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/ة/g, "ه")
    .replace(/[\u200c\s]+/g, " ").toLowerCase().trim();
}

export function matchesColumnFilter(value: string, filter: ColumnFilterConfig) {
  return (!filter.selectedValues || filter.selectedValues.has(value)) &&
    (!filter.textCondition || normalize(value).includes(normalize(filter.textCondition)));
}

export function columnFilterOptions<Row>(rows: Row[], getValue: (row: Row) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = getValue(row);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts, ([value, count]) => ({ value, count }));
}
