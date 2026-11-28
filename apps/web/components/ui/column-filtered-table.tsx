"use client";

import { useState, type ReactNode } from "react";
import { useTableColumnFilters } from "@/hooks/use-table-column-filters";
import { Pagination } from "./pagination";
import { Table, TableBody, TableEmptyCell, TableHead, TableHeader, TableRow } from "./table";
import type { ColumnFilterConfig } from "./table-column-filter";

export interface ListColumn<Row> {
  label: string;
  value?: (row: Row) => string;
  numeric?: boolean;
  srOnly?: boolean;
}

const pageSize = 25;

export function ColumnFilteredTable<Row>({
  label, columns, rows, renderRow, emptyTitle, initialFilters,
}: {
  label: string;
  columns: ListColumn<Row>[];
  rows: Row[];
  renderRow: (row: Row) => ReactNode;
  emptyTitle: string;
  initialFilters?: Partial<Record<number, ColumnFilterConfig>>;
}) {
  const [requestedPage, setPage] = useState(0);
  const valueColumns = Object.fromEntries(columns.flatMap(({ label, value }) => value ? [[label, value]] : []));
  const filters = useTableColumnFilters<Row, string>(
    rows, valueColumns,
    Object.fromEntries(columns.flatMap(({ label }, index) => {
      const filter = initialFilters?.[index];
      return filter ? [[label, filter]] : [];
    })),
  );
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(filters.rows.length / pageSize) - 1));

  return (
    <>
      <Table toolbar={false} columnControls={false} aria-label={label}>
        <TableHeader sticky>
          <TableRow>
            {columns.map(({ label, numeric, srOnly, value }) => (
              <TableHead
                key={label}
                numeric={numeric}
                columnFilter={value ? filters.bind(label, () => setPage(0)) : undefined}
              >
                <span className={srOnly ? "sr-only" : undefined}>{label}</span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filters.rows.length ? filters.rows.slice(page * pageSize, (page + 1) * pageSize).map(renderRow) : (
            <TableEmptyCell colSpan={columns.length} title={rows.length ? "ردیفی با این فیلترها پیدا نشد" : emptyTitle} />
          )}
        </TableBody>
      </Table>
      <Pagination page={page} total={filters.rows.length} pageSize={pageSize}
        onPrevious={() => setPage(page - 1)} onNext={() => setPage(page + 1)} />
    </>
  );
}
