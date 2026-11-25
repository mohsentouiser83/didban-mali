"use client";

import { useMemo, useState } from "react";
import { DownloadSimpleIcon, FileTextIcon, ReceiptIcon } from "@phosphor-icons/react";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import type { MoadianTransmission } from "@/lib/moadian-transmissions";
import { amount, displayDate, persian } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "./page-parts";

const stateDescriptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "primary" }> = {
  queued: { label: "در صف ارسال", tone: "primary" },
  sent: { label: "ارسال‌شده / در انتظار استعلام", tone: "warning" },
  success: { label: "ارسال موفق و ثبت در کارپوشه", tone: "success" },
  failed: { label: "خطا در کارپوشه", tone: "danger" },
};

export function MoadianReportsView() {
  const workspace = useWorkspace();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const resource = useResource<{ items: MoadianTransmission[] }>(
    workspace.companyPath("moadian/transmissions?limit=100"),
  );

  const items = resource.data?.items ?? [];

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const ref = (item.invoice_reference || "").toLowerCase();
        const taxId = (item.tax_id || "").toLowerCase();
        const uid = (item.uid || "").toLowerCase();
        if (!ref.includes(q) && !taxId.includes(q) && !uid.includes(q)) return false;
      }
      return true;
    });
  }, [items, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = items.length;
    const success = items.filter((i) => i.status === "success").length;
    const failed = items.filter((i) => i.status === "failed").length;
    const pending = items.filter((i) => i.status === "sent" || i.status === "queued").length;
    return { total, success, failed, pending };
  }, [items]);

  const exportExcel = () => {
    if (!filteredItems.length) return;
    const rows = filteredItems.map((item) => ({
      "شماره فاکتور": item.invoice_reference,
      "شناسه یکتای مالیاتی (Tax ID)": item.tax_id || "—",
      "تاریخ ثبت": displayDate(item.created_at),
      "وضعیت سامانه": stateDescriptions[item.status]?.label || item.status,
      "کد رهگیری سامانه": item.uid || "—",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "صورتحساب‌های مؤدیان");
    XLSX.writeFile(workbook, `moadian-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!workspace.company) return <NoCompany />;

  return (
    <>
      <PageHeader
        title="گزارش صورتحساب‌های سامانه مؤدیان"
        icon={ReceiptIcon}
        action={
          <Button
            variant="secondary"
            onClick={exportExcel}
            disabled={!filteredItems.length}
            className="gap-1.5"
          >
            <DownloadSimpleIcon size={16} aria-hidden />
            خروجی اکسل گزارش
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid gap-4 sm:grid-cols-4 mb-5">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
          <span className="text-xs text-muted">کل صورتحساب‌های ارسالی</span>
          <div className="mt-2 text-xl font-medium tabular-nums text-foreground">
            {persian(stats.total)} <span className="text-xs text-muted">فقره</span>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
          <span className="text-xs text-muted">ثبت موفق در کارپوشه</span>
          <div className="mt-2 text-xl font-medium tabular-nums text-success">
            {persian(stats.success)} <span className="text-xs text-muted">فقره</span>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
          <span className="text-xs text-muted">در انتظار استعلام / صف</span>
          <div className="mt-2 text-xl font-medium tabular-nums text-warning">
            {persian(stats.pending)} <span className="text-xs text-muted">فقره</span>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
          <span className="text-xs text-muted">خطا در پذیرش کارپوشه</span>
          <div className="mt-2 text-xl font-medium tabular-nums text-danger">
            {persian(stats.failed)} <span className="text-xs text-muted">فقره</span>
          </div>
        </div>
      </div>

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
                  { value: "success", label: "ثبت موفق" },
                  { value: "sent", label: "در انتظار استعلام" },
                  { value: "queued", label: "در صف ارسال" },
                  { value: "failed", label: "خطا در پذیرش" },
                ]}
              />
            </Field>
          </div>
        </div>

        {resource.loading ? (
          <LoadingState label="در حال دریافت سوابق صورتحساب‌ها..." />
        ) : resource.error ? (
          <ErrorState message={resource.error.message} onRetry={resource.refresh} />
        ) : !filteredItems.length ? (
          <TableEmptyCell colSpan={7} title="صورتحسابی با این مشخصات یافت نشد" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شماره فاکتور</TableHead>
                <TableHead>شناسه یکتای مالیاتی (۲۲ رقمی)</TableHead>
                <TableHead>تاریخ ارسال</TableHead>
                <TableHead>وضعیت سامانه</TableHead>
                <TableHead>کد رهگیری بسته</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((row) => {
                const status = stateDescriptions[row.status] || { label: row.status, tone: "neutral" };
                return (
                  <TableRow key={row.id}>
                    <TableRowHeader>
                      <bdi>{row.invoice_reference}</bdi>
                    </TableRowHeader>
                    <TableCell>
                      <code className="text-xs bg-canvas px-1.5 py-0.5 rounded font-mono select-all">
                        {row.tax_id || "—"}
                      </code>
                    </TableCell>
                    <TableCell>{displayDate(row.created_at)}</TableCell>
                    <TableCell>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted font-mono">{row.uid?.slice(0, 8) || "—"}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
