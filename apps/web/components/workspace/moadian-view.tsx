"use client";

import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { useState } from "react";
import { ReceiptIcon as HeaderIcon, ArrowDownLeftIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
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
import { Tabs } from "@/components/ui/tabs";
import { useFinancialView } from "@/hooks/use-financial-view";
import { useMoadianImport } from "@/hooks/use-moadian-import";
import { amount, displayDate, persian } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "./page-parts";

const comparisonLabels: Record<string, string> = {
  matched: "منطبق",
  needs_review: "نیازمند بررسی",
  portal_only: "فقط در کارپوشه",
  internal_only: "فقط در دیدبان",
  amount_mismatch: "اختلاف مبلغ",
  tax_mismatch: "اختلاف مالیات",
  date_mismatch: "اختلاف تاریخ",
  party_mismatch: "اختلاف طرف‌حساب",
};

export function MoadianView() {
  const view = useFinancialView("moadian");
  if (!view.workspace.company) return <NoCompany />;
  return (
    <MoadianContent
      key={`${view.workspace.user?.id}:${view.workspace.company.id}:${view.workspace.periodId}`}
      view={view}
    />
  );
}

function MoadianContent({ view }: { view: ReturnType<typeof useFinancialView> }) {
  const [activeTab, setActiveTab] = useState<"sales" | "purchases">("sales");
  const importSource = useMoadianImport(view.manifest?.id);
  const unit = view.workspace.unit;
  const unitName = unit === "IRR" ? "ریال" : "تومان";
  const sales = view.manifest?.details.moadian?.sales ?? [];
  const purchases = view.manifest?.details.moadian?.purchases ?? [];
  const rows = activeTab === "sales" ? sales : purchases;

  const activePeriodName =
    view.workspace.periods.find((p) => p.id === view.workspace.periodId)?.name || "همه دوره‌ها";

  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="صورتحساب‌های کارپوشه"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink variant="secondary" href="/moadian/transmissions">
              ارسال و استعلام صورتحساب
            </ButtonLink>
            <ButtonLink variant="secondary" href="/reconciliation/moadian">
              تطبیق کارپوشه
            </ButtonLink>
          </div>
        }
      />
      {view.loading ? (
        <LoadingState label="در حال دریافت اطلاعات کارپوشه مؤدیان..." />
      ) : view.error ? (
        <ErrorState message={view.error.message} onRetry={view.refresh} />
      ) : (
        <Panel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge tone="neutral">دوره: {activePeriodName}</Badge>
              {view.manifest?.created_at && (
                <span>تاریخ منبع پردازش: {displayDate(view.manifest.created_at)}</span>
              )}
            </div>
            {!view.workspace.periodId && (
              <StatusMessage tone="warning">
                برای ورود اکسل کارپوشه، ابتدا دورهٔ مالی را از هدر انتخاب کنید.
              </StatusMessage>
            )}
          </div>
          <div className="mb-4">
            <Tabs
              value={activeTab}
              onChange={setActiveTab}
              items={[
                { id: "sales", label: `فروش کارپوشه (${persian(sales.length)})`, icon: ArrowUpRightIcon },
                { id: "purchases", label: `خرید کارپوشه (${persian(purchases.length)})`, icon: ArrowDownLeftIcon },
              ]}
            />
          </div>
          <Table
            importPersistsSource
            title={activeTab === "sales" ? "صورتحساب‌های فروش مؤدیان" : "صورتحساب‌های خرید مؤدیان"}
            onImport={view.workspace.canWrite && view.workspace.periodId ? (data) => importSource(data, activeTab) : undefined}
          >
            <TableHeader>
              <TableRow>
                <TableHead>شماره صورتحساب</TableHead>
                <TableHead>شناسه یکتای مالیاتی</TableHead>
                <TableHead>دوره</TableHead>
                <TableHead>تاریخ کارپوشه</TableHead>
                <TableHead numeric>مبلغ کارپوشه ({unitName})</TableHead>
                <TableHead numeric>ارزش افزوده کارپوشه ({unitName})</TableHead>
                <TableHead>نتیجه تطبیق</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => {
                const state = row.status || row.state;
                return (
                  <TableRow key={`${row.tax_id ?? row.reference ?? "row"}:${index}`}>
                    <TableRowHeader>{row.reference || row.invoice_id || "—"}</TableRowHeader>
                    <TableCell><bdi>{row.tax_id || "—"}</bdi></TableCell>
                    <TableCell className="text-xs text-muted">{activePeriodName}</TableCell>
                    <TableCell>{row.date ? displayDate(row.date) : "—"}</TableCell>
                    <TableCell numeric>{amount(row.portal_amount ?? row.portal, unit)}</TableCell>
                    <TableCell numeric>{amount(row.tax, unit)}</TableCell>
                    <TableCell>
                      <Badge tone={state === "matched" ? "success" : state === "needs_review" ? "warning" : "neutral"}>
                        {state ? comparisonLabels[state] ?? "وضعیت نامشخص" : "وضعیت نامشخص"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <TableRowActions label={`عملیات ${row.internal_reference}`}>
                        {row.internal_reference && (
                        <TableRowAction
                          href={`${activeTab === "sales" ? "/receivables" : "/payables"}?tab=imported&reference=${encodeURIComponent(row.internal_reference)}`}
                        >
                          جست‌وجوی فاکتور داخلی
                        </TableRowAction>
                      )}
                      </TableRowActions>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!rows.length && (
                <TableEmptyCell colSpan={8} title="صورتحساب پردازش‌شده‌ای برای این دوره وجود ندارد" />
              )}
            </TableBody>
          </Table>
        </Panel>
      )}
    </>
  );
}
