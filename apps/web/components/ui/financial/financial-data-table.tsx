import React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { TableEmptyCell, Table, TableHeader, TableHead, TableBody, TableRow, TableCell, type TableDensity } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export interface Column<T> {
  key: string;
  header: string;
  align?: "right" | "left" | "center";
  numeric?: boolean;
  sortable?: boolean;
  widthClassName?: string;
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
  data, columns, keyExtractor, density = "compact", sortColumn, sortDirection,
  onSort, onRowClick, selectedRowKey, emptyMessage = "رکوردی جهت نمایش یافت نشد.",
  loading = false, stickyHeader = true, tableAriaLabel, className, ...props
}: FinancialDataTableProps<T>) {
  const alignment = (column: Column<T>) => column.align === "center" ? "text-center" : column.align === "left" || column.numeric ? "text-end" : "text-start";
  return <div className={cn("min-w-0 overflow-hidden rounded-[var(--ds-card-radius)]", className)} aria-busy={loading} {...props}>
    <Table aria-label={tableAriaLabel} density={density}>
      <TableHeader sticky={stickyHeader}><TableRow>{columns.map((column) => {
        const sorted = sortColumn === column.key;
        const SortIcon = sorted ? sortDirection === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
        return <TableHead key={column.key} className={cn(alignment(column), column.widthClassName)} aria-sort={column.sortable && sorted ? sortDirection === "asc" ? "ascending" : "descending" : undefined}>
          {column.sortable && onSort ? <Button variant="ghost" className="min-h-11 gap-1.5 px-0 text-inherit" onClick={() => onSort(column.key)}>{column.header}<SortIcon className="size-3" aria-hidden="true" /></Button> : column.header}
        </TableHead>;
      })}</TableRow></TableHeader>
      <TableBody>{loading ? Array.from({ length: 4 }, (_, index) => <TableRow key={index}>{columns.map((column) => <TableCell key={column.key}><Skeleton className="h-4 w-28" /></TableCell>)}</TableRow>) : !data.length ?
        <TableRow><TableEmptyCell colSpan={Math.max(columns.length, 1)} className="h-40 p-0 text-center text-muted-foreground">{emptyMessage}</TableEmptyCell></TableRow> :
        data.map((row, index) => {
          const key = keyExtractor(row, index);
          return <TableRow key={key} selected={selectedRowKey != null && selectedRowKey === key}>
            {columns.map((column, columnIndex) => {
              const content = column.render ? column.render(row, index) : String((row as Record<string, unknown>)[column.key] ?? "—");
              return <TableCell key={column.key} numeric={column.numeric} className={alignment(column)}>
                {onRowClick && columnIndex === 0 ? <Button variant="ghost" className="h-auto min-h-11 px-0 text-inherit" onClick={() => onRowClick(row)}>{content}</Button> : content}
              </TableCell>;
            })}
          </TableRow>;
        })}</TableBody>
    </Table>
  </div>;
}
