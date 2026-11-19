"use client";
import { type AssistantDataTable } from "@/hooks/use-floating-assistant";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableIcon } from "@phosphor-icons/react";

export function AssistantDataTableWidget({
  dataTable,
}: {
  dataTable: AssistantDataTable;
}) {
  if (!dataTable || !dataTable.rows?.length) return null;

  return (
    <div
      role="region"
      aria-label={dataTable.title || "جدول داده‌های گزارش"}
      className="mt-3.5 space-y-2 rounded-xl border border-border/80 bg-surface/95 p-3 shadow-xs"
    >
      {dataTable.title && (
        <div className="flex items-center gap-2 border-b border-border/60 pb-2">
          <span className="grid size-6 place-items-center rounded-md bg-primary-soft text-primary" aria-hidden>
            <TableIcon size={14} />
          </span>
          <h4 className="text-xs font-medium text-foreground">{dataTable.title}</h4>
        </div>
      )}

      <div className="max-h-72 overflow-x-auto overscroll-x-contain rounded-lg border border-border/60">
        <Table className="min-w-full text-xs">
          <TableHeader>
            <TableRow className="bg-canvas/80 text-[11px] font-medium text-muted">
              {dataTable.columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={
                    col.align === "end"
                      ? "text-end px-3 py-2"
                      : col.align === "center"
                      ? "text-center px-3 py-2"
                      : "text-start px-3 py-2"
                  }
                >
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {dataTable.rows.map((row, rIdx) => (
              <TableRow
                key={typeof row.id === "string" || typeof row.id === "number" ? row.id : rIdx}
                className="hover:bg-canvas/50 transition-colors border-b border-border/40 last:border-b-0"
              >
                {dataTable.columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={
                      col.align === "end"
                        ? "text-end px-3 py-2 tabular-nums font-mono text-xs"
                        : col.align === "center"
                        ? "text-center px-3 py-2"
                        : "text-start px-3 py-2 font-normal text-foreground"
                    }
                  >
                    {String(row[col.key] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}

            {dataTable.summary && (
              <TableRow className="bg-primary-soft/30 font-medium text-xs border-t-2 border-primary/20">
                {dataTable.columns.map((col, cIdx) => (
                  <TableCell
                    key={col.key}
                    className={
                      col.align === "end"
                        ? "text-end px-3 py-2 tabular-nums font-mono font-medium text-primary"
                        : "text-start px-3 py-2 font-medium text-foreground"
                    }
                  >
                    {String(dataTable.summary?.[col.key] ?? (cIdx === 0 ? "جمع کل" : "—"))}
                  </TableCell>
                ))}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {dataTable.footer_text && (
        <p className="pt-1 text-[11px] leading-relaxed text-muted">
          {dataTable.footer_text}
        </p>
      )}
    </div>
  );
}
