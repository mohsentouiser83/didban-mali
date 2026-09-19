import React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TableDensity } from "@/components/ui/table";

export interface Column<T> {
  key: string;
  header: string;
  align?: "right" | "left" | "center";
  numeric?: boolean;
  sortable?: boolean;
  width?: string;
  render?: (row: T, index: number) => React.ReactNode;
}

export interface FinancialDataTableProps<T> extends React.HTMLAttributes<HTMLDivElement> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T, index: number) => string | number;
  density?: TableDensity;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  selectedRowKey?: string | number | null;
  emptyMessage?: string;
  loading?: boolean;
  stickyHeader?: boolean;
  tableAriaLabel?: string;
}

export function FinancialDataTable<T>({
  data,
  columns,
  keyExtractor,
  density = "normal",
  sortColumn,
  sortDirection,
  onSort,
  onRowClick,
  selectedRowKey,
  emptyMessage = "رکوردی جهت نمایش یافت نشد.",
  loading = false,
  stickyHeader = true,
  tableAriaLabel,
  className,
  ...props
}: FinancialDataTableProps<T>) {
  const normalizedDensity = density === "default" ? "normal" : density;
  const densityPadding = {
    compact: "py-2 px-3 text-xs",
    normal: "py-3 px-4 text-xs lg:text-sm",
    spacious: "py-4 px-5 text-sm",
  }[normalizedDensity];

  const headerPadding = {
    compact: "py-2.5 px-3 text-xs",
    normal: "py-3 px-4 text-xs",
    spacious: "py-3.5 px-5 text-xs font-bold",
  }[normalizedDensity];

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-[var(--ds-border)] bg-[var(--ds-card)] shadow-sm",
        className
      )}
      {...props}
    >
      <div className="overflow-x-auto">
        <table aria-label={tableAriaLabel} className="w-full border-collapse text-start">
          <thead className={cn("bg-[var(--ds-table-header)] text-[var(--ds-foreground-soft)] border-b border-[var(--ds-border-strong)]", stickyHeader && "sticky top-0 z-10")}>
            <tr>
              {columns.map((col) => {
                const isSorted = sortColumn === col.key;
                const alignClass =
                  col.align === "left" || col.numeric
                    ? "text-left"
                    : col.align === "center"
                    ? "text-center"
                    : "text-right";

                return (
                  <th
                    key={col.key}
                    style={{ width: col.width }}
                    className={cn(
                      "font-bold text-muted-foreground select-none whitespace-nowrap transition-colors",
                      headerPadding,
                      alignClass,
                      col.sortable && "cursor-pointer hover:text-foreground"
                    )}
                    onClick={() => col.sortable && onSort?.(col.key)}
                  >
                    <div
                      className={cn(
                        "inline-flex items-center gap-1.5",
                        col.align === "left" || col.numeric ? "flex-row-reverse" : "flex-row"
                      )}
                    >
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="text-muted-foreground/60">
                          {isSorted ? (
                            sortDirection === "asc" ? (
                              <ArrowUp className="size-3 text-foreground" />
                            ) : (
                              <ArrowDown className="size-3 text-foreground" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ds-border)]/60">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map((col, j) => (
                    <td key={j} className={densityPadding}>
                      <div className="h-4 w-full max-w-[120px] rounded bg-muted/60" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-xs text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const key = keyExtractor(row, index);
                const isSelected = selectedRowKey !== undefined && selectedRowKey === key;

                return (
                  <tr
                    key={key}
                    className={cn(
                      "transition-colors hover:bg-[var(--ds-table-hover)]",
                      isSelected && "bg-[var(--ds-table-selected)] shadow-[inset_3px_0_0_var(--ds-primary)] font-medium",
                      onRowClick && "cursor-pointer"
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((col) => {
                      const alignClass =
                        col.align === "left" || col.numeric
                          ? "text-left font-mono [font-variant-numeric:tabular-nums]"
                          : col.align === "center"
                          ? "text-center"
                          : "text-right";

                      return (
                        <td key={col.key} className={cn("whitespace-nowrap align-middle", densityPadding, alignClass)}>
                          {col.render
                            ? col.render(row, index)
                            : (row as Record<string, unknown>)[col.key] !== undefined
                            ? String((row as Record<string, unknown>)[col.key])
                            : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
