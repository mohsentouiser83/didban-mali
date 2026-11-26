"use client";

import { DownloadSimpleIcon, ReceiptIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/content-states";
import { Field, FormMessage } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
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
  const { workspace, resource, items, statusFilter, setStatusFilter, searchQuery, setSearchQuery, exportExcel } = view;

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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Field id="moadian-search" label="جستجوی فاکتور / شناسه مالیاتی">
              <Input
                id="moadian-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="شماره فاکتور، ۲۲ رقمی مالیاتی..."
                className="w-64 text-xs"
              />
            </Field>
            <Field id="moadian-status-filter" label="فیلتر وضعیت">
              <Select
                id="moadian-status-filter"
                value={statusFilter}
                onValueChange={setStatusFilter}
                options={[
                  { value: "all", label: "همه وضعیت‌ها" },
                  ...Object.entries(moadianReportStates).map(([value, state]) => ({ value, label: state.label })),
                ]}
              />
            </Field>
            <Field id="moadian-report-period" label="دورهٔ مالی">
              <Select
                id="moadian-report-period"
                value={view.periodId || "all"}
                onValueChange={(id) => view.setPeriodId(id === "all" ? "" : id)}
                options={[{ value: "all", label: "همه دوره‌ها" }, ...workspace.periods.map((period) => ({ value: period.id, label: period.name }))]}
              />
            </Field>
          </div>
        </div>
        <FormMessage error>{view.exportError}</FormMessage>

        {resource.loading ? (
          <LoadingState label="در حال دریافت سوابق صورتحساب‌ها..." />
        ) : resource.error ? (
          <ErrorState message={resource.error.message} onRetry={resource.refresh} />
        ) : !items.length ? (
          <EmptyState title="صورتحسابی با این مشخصات یافت نشد" />
        ) : (
          <>
          <Table showSearch={false}>
            <TableHeader>
              <TableRow>
                <TableHead>شماره فاکتور</TableHead>
                <TableHead>شناسه یکتای مالیاتی (۲۲ رقمی)</TableHead>
                <TableHead>دورهٔ مالی</TableHead>
                <TableHead>تاریخ ثبت</TableHead>
                <TableHead>آخرین استعلام</TableHead>
                <TableHead>وضعیت سامانه</TableHead>
                <TableHead>کد رهگیری بسته</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
