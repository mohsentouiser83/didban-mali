"use client";

import { useState } from "react";
import {
  CheckCircleIcon,
  WarningCircleIcon,
  ClockIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useMoadianReconciliation } from "@/hooks/use-moadian-reconciliation";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
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
    return (
      <Panel>
        <EmptyState
          title="فاکتور فروش داخلی موجود نیست"
          description="برای تطبیق با کارپوشه مؤدیان، ابتدا فاکتورهای فروش را ثبت یا بارگذاری کنید."
          action={<ButtonLink href="/receivables">ثبت فاکتور فروش در مطالبات و فروش</ButtonLink>}
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <Panel
        title="شاخص‌های تطبیق دفاتر و سامانه مؤدیان"
        action={
          <Badge tone={moadian.hasPortalEvidence ? "success" : "warning"}>
            {moadian.hasPortalEvidence ? "تطبیق با داده کارپوشه انجام شد" : "داده کارپوشه موجود نیست"}
          </Badge>
        }
      >
        {!moadian.hasPortalEvidence && (
          <StatusMessage tone="warning">
            <div className="flex flex-wrap items-center justify-between gap-3 w-full">
              <span>برای این فاکتورها شواهد پذیرش یا خروجی کارپوشه مؤدیان ثبت نشده است.</span>
              <div className="flex flex-wrap gap-2">
                <ButtonLink variant="secondary" href="/moadian">ثبت/ورود کارپوشه مؤدیان</ButtonLink>
                <ButtonLink variant="ghost" href="/moadian/transmissions">ارسال و استعلام</ButtonLink>
              </div>
            </div>
          </StatusMessage>
        )}
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
              {amount(moadian.hasPortalEvidence ? summary.vat_discrepancy : null, unit)}
            </p>
          </div>

          <div className="rounded-xl border border-border/80 bg-surface-subtle p-4">
            <p className="text-xs text-muted">پوشش مبلغ پذیرفته‌شده</p>
            <p className="mt-1 font-semibold text-lg">
              {!moadian.hasPortalEvidence || summary.compliance_percentage == null ? "—" : `${persian(summary.compliance_percentage)}٪`}
            </p>
          </div>
        </div>

        {summary && summary.untransmitted_count > 0 && (
          <div className="mt-4">
            <StatusMessage tone="warning">
              <WarningCircleIcon size={20} className="text-amber-600" />
              {persian(summary.untransmitted_count)} فاکتور فروش نهایی به سامانه مؤدیان ارسال نشده است.
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

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>فاکتور داخلی</TableHead>
              <TableHead>تاریخ</TableHead>
              <TableHead>طرف‌حساب</TableHead>
              <TableHead numeric>مبلغ دفتر (ریال)</TableHead>
              <TableHead numeric>مبلغ بستهٔ پذیرفته‌شده (ریال)</TableHead>
              <TableHead numeric>اختلاف (ریال)</TableHead>
              <TableHead>وضعیت</TableHead>
              <TableHead>مدرک مؤدیان</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {moadian[activeTab].map((item) => (
              <TableRow key={item.invoice_id}>
                <TableRowHeader>
                  <ButtonLink variant="ghost" href={`/receivables?reference=${encodeURIComponent(item.reference)}`}>
                    {item.reference || item.invoice_id.slice(0, 8)}
                  </ButtonLink>
                </TableRowHeader>
                <TableCell>{displayDate(item.date)}</TableCell>
                <TableCell>{item.party_id || "—"}</TableCell>
                <TableCell numeric>{amount(item.amount, unit)}</TableCell>
                <TableCell numeric>{amount(item.submitted_amount, unit)}</TableCell>
                <TableCell numeric>{amount(item.difference, unit)}</TableCell>
                <TableCell><Badge>{item.status_label}</Badge></TableCell>
                <TableCell>
                  {item.transmission_id && (
                    <ButtonLink variant="ghost" href={`/moadian/reports?reference=${encodeURIComponent(item.tax_id || item.reference)}`}>
                      {item.tax_id || "کارنامه ارسال"}
                    </ButtonLink>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!moadian[activeTab].length && <TableEmptyCell colSpan={8} title="موردی در این وضعیت وجود ندارد" />}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
