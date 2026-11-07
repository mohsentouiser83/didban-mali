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
import { PageHeader, PeriodFilter, Panel } from "./page-parts";
export function NativeDashboardView() {
  const c = useNativeDashboard();
  return (
    <>
      <PageHeader
        title="خلاصه مالی"
        icon={SquaresFourIcon}
        action={
          <ButtonLink href="/reports/native" variant="secondary">
            صورت مالی دفتر دیدبان
          </ButtonLink>
        }
      />
      <PeriodFilter />
      {c.loading ? (
        <LoadingState />
      ) : c.error ? (
        <ErrorState message={c.error.message} onRetry={c.refresh} />
      ) : !c.data ? (
        <Panel>
          <EmptyState
            title="گزارش مالی دفتر اصلی ذخیره نشده"
            action={
              <ButtonLink href="/reports/native">تهیه گزارش مالی</ButtonLink>
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
              </div>
              <Badge tone="primary">
                دفتر اصلی · تا {displayDate(c.data.as_of)}
              </Badge>
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
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/accounting/journals" variant="secondary">
              دفتر اصلی
            </ButtonLink>
            <ButtonLink href="/cashflow/scenarios" variant="secondary">سناریوی نقدینگی</ButtonLink>
            <ButtonLink href="/review/native-controls" variant="secondary">
              کنترل دفتر اصلی
            </ButtonLink>
            <ButtonLink
              href={`/api/v1${c.workspace.companyPath(`accounting/statements/${c.data.id}/export?format=pdf`)}`}
              variant="secondary"
              download
            >
              گزارش مبنا PDF
            </ButtonLink>
          </div>
        </>
      )}
    </>
  );
}
