"use client";

import { useState } from "react";
import {
  CheckCircleIcon,
  WarningCircleIcon,
  ClockIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useMoadianReconciliation } from "@/hooks/use-moadian-reconciliation";
import { StatusBadge } from "@/components/ui/badge";
import {
  EmptyState,
  LoadingState,
  ErrorState,
  StatusMessage,
} from "@/components/ui/content-states";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  TableRowHeader,
  TableEmptyCell,
} from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Panel } from "./page-parts";
import { amount, displayDate, persian } from "@/lib/utils";

export function MoadianReconciliationPanel() {
  const moadian = useMoadianReconciliation();
  const [activeTab, setActiveTab] = useState<"untransmitted" | "rejected" | "accepted" | "pending">("untransmitted");
  const unit = moadian.workspace.unit;

  if (moadian.loading) return <LoadingState />;
  if (moadian.error) {
    return <ErrorState message={moadian.error.message} onRetry={moadian.refresh} />;
  }

  const summary = moadian.summary;
  if (!summary?.invoices_count) {
    return <Panel><EmptyState title="هنوز فاکتور فروشی ثبت نشده است" /></Panel>;
  }

  return (
    <div className="space-y-6">
      <Panel title="شاخص‌های انطباق دفاتر با سامانه مؤدیان">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-border/80 bg-surface-subtle p-4">
            <p className="text-xs text-muted">فروش کل طبق دفاتر</p>
            <p className="mt-1 font-semibold text-lg">{amount(summary?.total_sales_book, unit)}</p>
            <p className="text-xs text-muted">{persian(summary?.invoices_count || 0)} فاکتور فروش</p>
          </div>

          <div className="rounded-xl border border-border/80 bg-surface-subtle p-4">
            <p className="text-xs text-muted">تأییدشده در کارپوشه</p>
            <p className="mt-1 font-semibold text-emerald-600 text-lg">
              {amount(summary?.total_sales_accepted, unit)}
            </p>
            <p className="text-xs text-muted">{persian(summary?.accepted_count || 0)} فاکتور موفق</p>
          </div>

          <div className="rounded-xl border border-border/80 bg-surface-subtle p-4">
            <p className="text-xs text-muted">فروش ارسال‌نشده (ریسک جریمه)</p>
            <p className={`mt-1 font-semibold text-lg ${Number(summary?.untransmitted_count || 0) > 0 ? "text-rose-600" : "text-muted"}`}>
              {amount(summary?.total_sales_untransmitted, unit)}
            </p>
            <p className="text-xs text-muted">{persian(summary?.untransmitted_count || 0)} فاکتور معلق</p>
          </div>

          <div className="rounded-xl border border-border/80 bg-surface-subtle p-4">
            <p className="text-xs text-muted">مغایرت مالیات بر ارزش افزوده</p>
            <p className={`mt-1 font-semibold text-lg ${summary?.vat_discrepancy !== "0" ? "text-amber-600" : "text-emerald-600"}`}>
              {amount(summary?.vat_discrepancy, unit)}
            </p>
            <p className="text-xs text-muted">اختلاف VAT دفاتر با کارپوشه</p>
          </div>

          <div className="rounded-xl border border-border/80 bg-surface-subtle p-4">
            <p className="text-xs text-muted">نرخ تمکین مالیاتی</p>
            <p className="mt-1 font-semibold text-lg">
              {summary.compliance_percentage == null ? "—" : `${persian(summary.compliance_percentage)}٪`}
            </p>
            <p className="text-xs text-muted">پوشش فاکتورهای معتبر</p>
          </div>
        </div>

        {summary && summary.untransmitted_count > 0 && (
          <div className="mt-4">
            <StatusMessage tone="warning">
              <WarningCircleIcon size={20} className="text-amber-600" />
              تعداد {persian(summary.untransmitted_count)} فاکتور فروش نهایی در دفاتر ثبت شده‌اند اما به سامانه مؤدیان ارسال نشده‌اند.
              جهت جلوگیری از جرائم عدم ارسال، فاکتورهای معلق را بررسی نمایید.
            </StatusMessage>
          </div>
        )}
      </Panel>

      <Panel title="ریز اقلام مغایرت مؤدیان">
        <div className="mb-4">
          <Tabs
            value={activeTab}
            onChange={setActiveTab}
            items={[
              {
                id: "untransmitted",
                label: `فاکتورهای ارسال‌نشده (${persian(moadian.untransmitted.length)})`,
                icon: WarningCircleIcon,
              },
              {
                id: "rejected",
                label: `ردشده در مؤدیان (${persian(moadian.rejected.length)})`,
                icon: XCircleIcon,
              },
              {
                id: "accepted",
                label: `تأییدشده در کارپوشه (${persian(moadian.accepted.length)})`,
                icon: CheckCircleIcon,
              },
              {
                id: "pending",
                label: `در انتظار استعلام (${persian(moadian.pending.length)})`,
                icon: ClockIcon,
              },
            ]}
          />
        </div>

        {activeTab === "untransmitted" && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شماره فاکتور</TableHead>
                <TableHead>تاریخ فاکتور</TableHead>
                <TableHead>طرف‌حساب (خریدار)</TableHead>
                <TableHead>مبلغ فاکتور</TableHead>
                <TableHead>مالیات بر ارزش افزوده</TableHead>
                <TableHead>وضعیت کارپوشه</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moadian.untransmitted.length ? (
                moadian.untransmitted.map((item) => (
                  <TableRow key={item.invoice_id}>
                    <TableRowHeader>{item.reference || item.invoice_id.slice(0, 8)}</TableRowHeader>
                    <TableCell>{displayDate(item.date)}</TableCell>
                    <TableCell>{item.party_id || "—"}</TableCell>
                    <TableCell className="font-semibold">{amount(item.amount, unit)}</TableCell>
                    <TableCell>{amount(item.vat_amount, unit)}</TableCell>
                    <TableCell>
                      <StatusBadge status="needs_review" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell colSpan={6} title="فاکتور ارسال‌نشده‌ای وجود ندارد" />
              )}
            </TableBody>
          </Table>
        )}

        {activeTab === "rejected" && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شماره فاکتور</TableHead>
                <TableHead>شناسه مالیاتی (Tax ID)</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>طرف‌حساب</TableHead>
                <TableHead>مبلغ فاکتور</TableHead>
                <TableHead>وضعیت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moadian.rejected.length ? (
                moadian.rejected.map((item) => (
                  <TableRow key={item.invoice_id}>
                    <TableRowHeader>{item.reference || item.invoice_id.slice(0, 8)}</TableRowHeader>
                    <TableCell className="font-mono text-xs">{item.tax_id || "—"}</TableCell>
                    <TableCell>{displayDate(item.date)}</TableCell>
                    <TableCell>{item.party_id || "—"}</TableCell>
                    <TableCell className="font-semibold">{amount(item.amount, unit)}</TableCell>
                    <TableCell>
                      <StatusBadge status="rejected" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell colSpan={6} title="هیچ فاکتور ردشده‌ای در سامانه مؤدیان وجود ندارد" />
              )}
            </TableBody>
          </Table>
        )}

        {activeTab === "accepted" && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شماره فاکتور</TableHead>
                <TableHead>شناسه یکتای مالیاتی (Tax ID)</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>طرف‌حساب</TableHead>
                <TableHead>مبلغ</TableHead>
                <TableHead>ارزش افزوده</TableHead>
                <TableHead>وضعیت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moadian.accepted.length ? (
                moadian.accepted.map((item) => (
                  <TableRow key={item.invoice_id}>
                    <TableRowHeader>{item.reference || item.invoice_id.slice(0, 8)}</TableRowHeader>
                    <TableCell className="font-mono text-xs text-emerald-700">{item.tax_id || "—"}</TableCell>
                    <TableCell>{displayDate(item.date)}</TableCell>
                    <TableCell>{item.party_id || "—"}</TableCell>
                    <TableCell className="font-semibold">{amount(item.amount, unit)}</TableCell>
                    <TableCell>{amount(item.vat_amount, unit)}</TableCell>
                    <TableCell>
                      <StatusBadge status="accepted" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell colSpan={7} title="هنوز فاکتور تاییدشده‌ای در کارپوشه ثبت نشده است" />
              )}
            </TableBody>
          </Table>
        )}

        {activeTab === "pending" && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شماره فاکتور</TableHead>
                <TableHead>شناسه مالیاتی</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>طرف‌حساب</TableHead>
                <TableHead>مبلغ</TableHead>
                <TableHead>وضعیت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moadian.pending.length ? (
                moadian.pending.map((item) => (
                  <TableRow key={item.invoice_id}>
                    <TableRowHeader>{item.reference || item.invoice_id.slice(0, 8)}</TableRowHeader>
                    <TableCell className="font-mono text-xs">{item.tax_id || "—"}</TableCell>
                    <TableCell>{displayDate(item.date)}</TableCell>
                    <TableCell>{item.party_id || "—"}</TableCell>
                    <TableCell className="font-semibold">{amount(item.amount, unit)}</TableCell>
                    <TableCell>
                      <StatusBadge status="pending" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell colSpan={6} title="هیچ فاکتوری در انتظار استعلام وجود ندارد" />
              )}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
