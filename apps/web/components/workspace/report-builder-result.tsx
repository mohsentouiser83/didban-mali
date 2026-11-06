"use client";
import { DrawerAction } from "@/components/ui/drawer-action";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { EvidenceList } from "./evidence-list";
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReportBuilderController } from "@/hooks/use-report-builder";
import { basisOptions, sourceOptions, reportCell } from "@/lib/report-builder";
import { displayDate, persian } from "@/lib/utils";
import { Panel } from "./page-parts";

export function ReportBuilderResult({
  controller: c,
}: {
  controller: ReportBuilderController;
}) {
  const data = c.preview;
  if (!data) return null;
  return (
    <Panel
      title={c.savedRun ? data.title || "گزارش ذخیره‌شده" : "پیش‌نمایش گزارش"}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge>
          {
            sourceOptions.find(
              (option) => option.value === (data.source || "imported_manifest"),
            )?.label
          }
        </Badge>
        <Badge>
          {
            basisOptions.find((option) => option.value === data.spec.basis)
              ?.label
          }
        </Badge>
        <Badge>{persian(data.row_count)} ردیف</Badge>
        <span className="text-xs text-muted">
          {displayDate(data.period.start)} تا {displayDate(data.period.end)} ·
          مبالغ ریال{data.as_of ? ` · تا ${displayDate(data.as_of)}` : ""}
        </span>
      </div>
      {data.spec.kind === "invoices" && (
        <p className="mb-4 text-xs text-muted">
          {data.spec.filters.direction === "all"
            ? "همه فاکتورها"
            : data.spec.filters.direction === "sales"
              ? "فروش"
              : "خرید"}{" "}
          · {data.spec.filters.party_id || "همه طرف‌ها"} ·{" "}
          {data.spec.filters.overdue_only ? "فقط سررسیدگذشته" : "همه سررسیدها"}
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {data.columns.map((column) => (
              <TableHead key={column.key}>{column.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.length ? (
            c.visibleRows.map((row, index) => (
              <TableRow key={String(row.id || row.metric_key || index)}>
                {data.columns.map((column) => (
                  <TableCell key={column.key}>
                    {reportCell(row, column.key)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableEmptyCell
              colSpan={data.columns.length}
              title="نتیجه‌ای برای این فیلترها نیست"
            />
          )}
        </TableBody>
      </Table>
      <Pagination
        page={c.resultPage}
        total={data.row_count}
        onPrevious={() => c.setResultPage(c.resultPage - 1)}
        onNext={() => c.setResultPage(c.resultPage + 1)}
      />
      {data.limitations.map((limit) => (
        <FormMessage key={limit}>{limit}</FormMessage>
      ))}
      <details className="mt-4 rounded-control border border-border p-3 text-xs">
        <summary className="min-h-8 cursor-pointer font-medium">
          شواهد و نسخهٔ مبنا
        </summary>
        <p className="mt-2 break-all text-muted">
          {data.native_invoice_snapshot_id ||
            data.native_statement_id ||
            data.manifest_id}
        </p>
        <div className="mt-3">
          <EvidenceList evidence={data.evidence_refs} />
        </div>
      </details>
      {c.savedRun ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {(["pdf", "xlsx"] as const).map((format) => (
            <ButtonLink
              key={format}
              variant="soft"
              href={`/api/v1${c.workspace.companyPath(`report-builder/runs/${c.savedRun!.id}/export`)}?format=${format}`}
            >
              دریافت {format.toUpperCase()}
            </ButtonLink>
          ))}
        </div>
      ) : (
        c.workspace.canWrite && (
          <DrawerAction title="ذخیره گزارش" busy={c.command.busy}><Form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              c.save();
            }}
          >
            <Field id="builder-name" label="نام گزارش">
              <Input
                id="builder-name"
                value={c.name}
                onChange={(event) => c.setName(event.target.value)}
                maxLength={120}
                required
              />
            </Field>
            <Button type="submit" busy={c.command.busy}>
              {c.definition ? "ذخیرهٔ نسخهٔ تازه" : "ذخیرهٔ گزارش"}
            </Button>
          <FormMessage error>{c.command.error?.message}</FormMessage></Form></DrawerAction>
        )
      )}
    </Panel>
  );
}
