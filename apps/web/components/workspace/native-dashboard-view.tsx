"use client";
import { SquaresFourIcon, WalletIcon } from "@phosphor-icons/react";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "@/components/ui/content-states";
import {
  MetricCardFrame,
  StatCards,
} from "@/components/ui/financial/stat-cards";
import { useNativeDashboard } from "@/hooks/use-native-dashboard";
import { amount, displayDate } from "@/lib/utils";
import { PageHeader, Panel } from "./page-parts";
export function NativeDashboardView() {
  const c = useNativeDashboard();
  return (
    <>
      <PageHeader
        title="داشبورد"
        icon={SquaresFourIcon}
        action={c.data && (
          <ButtonLink
            href={`/api/v1${c.workspace.companyPath(`accounting/statements/${c.data.id}/export?format=pdf`)}`}
            variant="secondary"
            download
          >
            گزارش مبنا PDF
          </ButtonLink>
        )}
      />
      {c.loading ? (
        <LoadingState />
      ) : c.error ? (
        <ErrorState message={c.error.message} />
      ) : !c.data ? (
        <Panel>
          <EmptyState
            title="گزارش مالی دفتر اصلی ذخیره نشده"
            description={
              c.hasSavedReports
                ? "گزارش‌های ذخیره‌شدهٔ دیگری در آرشیو موجود است؛ می‌توانید آن‌ها را ببینید یا نخستین گزارش دفتر اصلی را بسازید."
                : c.canPrepare
                  ? "برای دیدن شاخص‌های نقدینگی، سود و زیان و ترازنامه روی داشبورد، ابتدا اسناد را ثبت کرده یا نخستین گزارش دفتر اصلی را تولید کنید."
                  : "هنوز گزارشی برای نمایش روی داشبورد منتشر نشده است."
            }
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                {c.hasSavedReports && (
                  <ButtonLink href="/reports" variant="primary">
                    مشاهدهٔ گزارش موجود
                  </ButtonLink>
                )}
                {c.canPrepare && (
                  <>
                    <ButtonLink href="/reports/native" variant={c.hasSavedReports ? "secondary" : "primary"}>
                      ساخت نخستین گزارش
                    </ButtonLink>
                    <ButtonLink href="/accounting" variant="secondary">
                      ثبت سند حسابداری
                    </ButtonLink>
                  </>
                )}
                {!c.hasSavedReports && !c.canPrepare && (
                  <ButtonLink href="/reports" variant="secondary">
                    مشاهدهٔ آرشیو گزارش‌ها
                  </ButtonLink>
                )}
              </div>
            }
          />
        </Panel>
      ) : (
        <>
          <MetricCardFrame className="mb-5 rounded-summary border-lilac/70 bg-linear-115 from-primary-soft/80 via-surface to-lilac-soft sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <h2 className="mb-2 flex items-center gap-2 text-sm text-muted">
                  <WalletIcon size={20} aria-hidden className="text-primary" />
                  نقد طبق دفتر اصلی
                </h2>
                <div
                  key={`${c.cash?.value ?? "missing"}:${c.workspace.unit}`}
                  className="flex flex-wrap items-baseline gap-2 motion-safe:animate-value-change"
                >
                  <span className="break-all font-display text-cash font-medium leading-tight tabular-nums">
                    {amount(c.cash?.value, c.workspace.unit)}
                  </span>
                  <span className="text-sm text-muted">
                    {c.workspace.unit === "IRR" ? "ریال" : "تومان"}
                  </span>
                </div>
                {c.cash?.value == null && (
                  <p className="mt-3 text-sm text-muted">{c.cash?.reason}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <ButtonLink href="/reconciliation" variant="ghost" className="h-7 px-2 text-xs text-primary">
                    تطبیق بانک و شواهد نقد
                  </ButtonLink>
                  <ButtonLink href="/accounting/electronic-ledgers" variant="ghost" className="h-7 px-2 text-xs">
                    گردش در دفاتر الکترونیک
                  </ButtonLink>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 text-xs">
                <Badge tone="primary">
                  مبنا: دفتر اصلی · دوره {c.data.period?.name || "—"} · تاریخ برش {displayDate(c.data.as_of)}
                </Badge>
                {c.data.created_at && (
                  <span className="text-muted">
                    زمان به‌روزرسانی: {displayDate(c.data.created_at)}
                  </span>
                )}
              </div>
            </div>
          </MetricCardFrame>
          <StatCards
            showComparison={false}
            metrics={c.data.metrics}
            items={[
              { key: "ar_ledger", label: "خالص مطالبات تجاری دفتر" },
              { key: "ap_trade_ledger", label: "خالص بدهی تجاری دفتر" },
              { key: "revenue", label: "درآمد دفتر" },
              { key: "expense", label: "هزینه دفتر" },
              { key: "pre_tax_profit", label: "سود پیش از مالیات" },
            ]}
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface p-3.5 text-xs">
              <div className="text-muted">مطالبات فاکتوری (مستقل از مانده دفتر)</div>
              <div className="mt-1 font-medium tabular-nums text-foreground">
                {c.hasInvoicesData ? `${amount(c.openSalesInvoices, c.workspace.unit)} ${c.workspace.unit === "IRR" ? "ریال" : "تومان"}` : "—"}
              </div>
              <ButtonLink href="/receivables" variant="ghost" className="mt-1.5 h-6 px-1.5 text-xs text-primary">
                مشاهده فاکتورهای فروش و مطالبات
              </ButtonLink>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3.5 text-xs">
              <div className="text-muted">بدهی فاکتوری (مستقل از مانده دفتر)</div>
              <div className="mt-1 font-medium tabular-nums text-foreground">
                {c.hasInvoicesData ? `${amount(c.openPurchaseInvoices, c.workspace.unit)} ${c.workspace.unit === "IRR" ? "ریال" : "تومان"}` : "—"}
              </div>
              <ButtonLink href="/payables" variant="ghost" className="mt-1.5 h-6 px-1.5 text-xs text-primary">
                مشاهده فاکتورهای خرید و بدهی
              </ButtonLink>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3.5 text-xs">
              <div className="text-muted">گزارش و شواهد صورت‌های مالی</div>
              <ButtonLink href="/reports/native" variant="ghost" className="mt-2 h-6 px-1.5 text-xs text-primary">
                صورت‌های مالی اساسی دفتر بومی
              </ButtonLink>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3.5 text-xs">
              <div className="text-muted">پیش‌بینی ۳۰روزه و جریان نقد</div>
              <ButtonLink href="/cashflow/forecast" variant="ghost" className="mt-2 h-6 px-1.5 text-xs text-primary">
                مشاهده پیش‌بینی نقدینگی
              </ButtonLink>
            </div>
          </div>
        </>
      )}
    </>
  );
}
