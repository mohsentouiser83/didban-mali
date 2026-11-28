"use client";

import { DownloadSimpleIcon, ReceiptIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { FormMessage } from "@/components/ui/field";
import { TableColumnSelect } from "@/components/ui/table-column-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableEmptyCell,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import { CursorPagination } from "@/components/ui/pagination";
import { moadianReportState, moadianReportStates, useMoadianReport } from "@/hooks/use-moadian-report";
import { displayDate } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function MoadianReportsView({ initialQuery = "" }: { initialQuery?: string }) {
  const view = useMoadianReport(initialQuery);
  const { workspace, resource, items, exportExcel } = view;

  if (!workspace.company) return <NoCompany />;

  return (
    <>
      <PageHeader
        title="کارنامه ارسال صورتحساب‌های مؤدیان"
        icon={ReceiptIcon}
        action={
          <Button
            variant="secondary"
            onClick={exportExcel}
            disabled={!items.length} busy={view.exporting}
            className="gap-1.5"
          >
            <DownloadSimpleIcon size={16} aria-hidden />
            خروجی اکسل گزارش
          </Button>
        }
      />

      <Panel title="فهرست و کارنامه ارسال صورتحساب‌ها">
        <FormMessage error>{view.exportError}</FormMessage>

        {resource.loading ? (
          <LoadingState label="در حال دریافت سوابق صورتحساب‌ها..." />
        ) : resource.error ? (
          <ErrorState message={resource.error.message} />
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead columnFilter={view.columnFilter("invoice_reference")}>شماره فاکتور</TableHead>
                <TableHead columnFilter={view.columnFilter("tax_id")}>شناسه یکتای مالیاتی (۲۲ رقمی)</TableHead>
                <TableHead columnControl={
                  <TableColumnSelect columnTitle="دورهٔ مالی" value={view.periodId || "all"}
                    onValueChange={(id) => view.setPeriodId(id === "all" ? "" : id)}
                    options={[{ value: "all", label: "همه دوره‌ها" }, ...workspace.periods.map((period) => ({ value: period.id, label: period.name }))]} />
                }>دورهٔ مالی</TableHead>
                <TableHead>تاریخ ثبت</TableHead>
                <TableHead>آخرین استعلام</TableHead>
                <TableHead columnControl={
                  <TableColumnSelect columnTitle="وضعیت سامانه" value={view.statusFilter} onValueChange={view.setStatusFilter}
                    options={[{ value: "all", label: "همه وضعیت‌ها" }, ...Object.entries(moadianReportStates).map(([value, { label }]) => ({ value, label }))]} />
                }>وضعیت سامانه</TableHead>
                <TableHead>کد رهگیری بسته</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!items.length && <TableEmptyCell colSpan={7} title="صورتحسابی با این مشخصات یافت نشد" />}
              {items.map((row) => {
                const status = moadianReportState(row.status);
                return (
                  <TableRow key={row.id}>
                    <TableRowHeader>
                      <ButtonLink variant="ghost" href={`/receivables?reference=${encodeURIComponent(row.invoice_reference)}`}>
                        {row.invoice_reference}
                      </ButtonLink>
                    </TableRowHeader>
                    <TableCell>
                      <code className="text-xs bg-canvas px-1.5 py-0.5 rounded font-mono select-all">
                        {row.tax_id || "—"}
                      </code>
                    </TableCell>
                    <TableCell>{row.period_name ?? "—"}</TableCell>
                    <TableCell>{displayDate(row.created_at)}</TableCell>
                    <TableCell>{row.last_inquiry_at ? displayDate(row.last_inquiry_at) : "—"}</TableCell>
                    <TableCell>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted font-mono">{row.reference_number ?? row.uid ?? "—"}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <CursorPagination {...resource} />
          </>
        )}
      </Panel>
    </>
  );
}
