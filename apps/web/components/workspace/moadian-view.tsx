"use client";

import { useState } from "react";
import { ReceiptIcon as HeaderIcon, ArrowDownLeftIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
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
  const upload = useMoadianImport(view.manifest?.id);
  const unit = view.workspace.unit;
  const unitName = unit === "IRR" ? "ریال" : "تومان";
  const sales = view.manifest?.details.moadian?.sales ?? [];
  const purchases = view.manifest?.details.moadian?.purchases ?? [];
  const rows = activeTab === "sales" ? sales : purchases;

  return (
    <>
      <PageHeader icon={HeaderIcon} title="صورتحساب‌های کارپوشه" />
      {view.loading ? (
        <LoadingState label="در حال دریافت اطلاعات کارپوشه مؤدیان..." />
      ) : view.error ? (
        <ErrorState message={view.error.message} onRetry={view.refresh} />
      ) : (
        <Panel>
          {upload.busy && <LoadingState label="در حال ارسال فایل به سرور..." />}
          {upload.error && (
            <div className="mb-4 space-y-2" role="alert">
              <p>{upload.error}</p>
              {upload.sessionId && (
                <ButtonLink href={`/uploads/${upload.sessionId}`} variant="secondary">
                  مشاهده نوبت بارگذاری
                </ButtonLink>
              )}
            </div>
          )}
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
            onImport={view.workspace.canWrite && !upload.busy ? (data) => upload.importSource(data, activeTab) : undefined}
          >
            <TableHeader>
              <TableRow>
                <TableHead>شماره صورتحساب</TableHead>
                <TableHead>شناسه یکتای مالیاتی</TableHead>
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
                    <TableCell>{row.date ? displayDate(row.date) : "—"}</TableCell>
                    <TableCell numeric>{amount(row.portal_amount ?? row.portal, unit)}</TableCell>
                    <TableCell numeric>{amount(row.tax, unit)}</TableCell>
                    <TableCell>
                      <Badge tone={state === "matched" ? "success" : state === "needs_review" ? "warning" : "neutral"}>
                        {state ? comparisonLabels[state] ?? "وضعیت نامشخص" : "وضعیت نامشخص"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.internal_reference && (
                        <ButtonLink variant="ghost" href={`${activeTab === "sales" ? "/receivables" : "/payables"}?tab=imported&reference=${encodeURIComponent(row.internal_reference)}`}>
                          جست‌وجوی فاکتور داخلی
                        </ButtonLink>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!rows.length && (
                <TableEmptyCell colSpan={7} title="صورتحساب پردازش‌شده‌ای برای این دوره وجود ندارد" />
              )}
            </TableBody>
          </Table>
        </Panel>
      )}
    </>
  );
}
