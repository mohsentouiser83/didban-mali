"use client";
import { ReceiptIcon as HeaderIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import { useFinancialView } from "@/hooks/use-financial-view";
import { useWorkspace } from "@/hooks/workspace";
import type { ComparisonRow } from "@/lib/api";
import { amount } from "@/lib/utils";
import {
  NoCompany,
  NoResult,
  PageHeader,
  Panel,
  PeriodFilter,
} from "./page-parts";

const comparisonLabels: Record<string, string> = {
  matched: "مطابق",
  amount_mismatch: "اختلاف مبلغ",
  tax_mismatch: "اختلاف مالیات",
  portal_only: "فقط در مؤدیان",
  internal_only: "فقط در فاکتورها",
  reference_uncertain: "مرجع نیازمند بررسی",
  unavailable: "ناموجود",
};
function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  const { unit } = useWorkspace();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>فاکتور</TableHead>
          <TableHead>شناسه مالیاتی</TableHead>
          <TableHead>نتیجه</TableHead>
          <TableHead>اختلاف ({unit === "IRR" ? "ریال" : "تومان"})</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((row, index) => (
            <TableRow key={row.tax_id || row.reference || index}>
              <TableRowHeader>
                {row.reference || row.invoice_id || "—"}
              </TableRowHeader>
              <TableCell>
                <span dir="ltr" className="break-all text-xs">
                  {row.tax_id || "—"}
                </span>
              </TableCell>
              <TableCell>
                <Badge tone={row.status === "matched" ? "success" : "warning"}>
                  {comparisonLabels[row.status || row.state || ""] ||
                    row.reason ||
                    "نیازمند بررسی"}
                </Badge>
              </TableCell>
              <TableCell>{amount(row.difference, unit)}</TableCell>
            </TableRow>
          ))
        ) : (
          <TableEmptyCell colSpan={4} title="دو منبع قابل مقایسه موجود نیست" />
        )}
      </TableBody>
    </Table>
  );
}
export function MoadianView() {
  const view = useFinancialView("moadian");
  if (!view.workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader icon={HeaderIcon} title="مؤدیان" />
      <PeriodFilter />
      {view.loading ? (
        <LoadingState />
      ) : view.error ? (
        <ErrorState message={view.error.message} onRetry={view.refresh} />
      ) : !view.manifest ? (
        <NoResult />
      ) : (
        <div className="space-y-5">
          <Panel title="مقایسه فروش">
            <ComparisonTable
              rows={view.manifest.details.moadian?.sales || []}
            />
          </Panel>
          <Panel title="مقایسه خرید">
            <ComparisonTable
              rows={view.manifest.details.moadian?.purchases || []}
            />
          </Panel>
        </div>
      )}
    </>
  );
}
