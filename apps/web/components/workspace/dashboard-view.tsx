"use client";
import { SquaresFourIcon as HeaderIcon } from "@phosphor-icons/react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/content-states";
import { CashChart } from "@/components/ui/financial/financial-chart";
import { StatCards } from "@/components/ui/financial/stat-cards";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import { NativeDashboardView } from "./native-dashboard-view";
import { useDashboard } from "@/hooks/use-financial-view";
import { amount, displayDate } from "@/lib/utils";
import {
  ArrowUpLeftIcon,
  UsersThreeIcon,
  ReceiptIcon,
  ClockCounterClockwiseIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  NoCompany,
  NoResult,
  PageHeader,
  Panel,
  PeriodFilter,
} from "./page-parts";

function ImportedDashboardView() {
  const view = useDashboard();
  const { unit } = view.workspace;
  if (!view.workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="خلاصه مالی"
        action={
          <ButtonLink href="/reports" variant="secondary">
            گزارش‌ها
            <ArrowUpLeftIcon size={16} className="text-primary" aria-hidden />
          </ButtonLink>
        }
      />
      <PeriodFilter />
      {view.loading ? (
        <LoadingState />
      ) : view.error ? (
        <ErrorState message={view.error.message} onRetry={view.refresh} />
      ) : !view.manifest ? (
        <NoResult />
      ) : (
        <>
          <section className="mb-5 overflow-hidden rounded-summary border border-lilac/70 bg-linear-115 from-primary-soft/80 via-surface to-lilac-soft p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <div className="mb-2 flex items-center gap-2 text-muted">
                  <WalletIcon size={20} aria-hidden className="text-primary" />
                  مانده نقد بانک
                </div>
                <div
                  key={view.metrics.cash?.value || "missing"}
                  className="flex flex-wrap items-baseline gap-2 motion-safe:animate-value-change"
                >
                  <span className="break-all font-display text-cash font-medium leading-tight tabular-nums">
                    {amount(view.metrics.cash?.value, unit)}
                  </span>
                  <span className="text-sm text-muted">
                    {unit === "IRR" ? "ریال" : "تومان"}
                  </span>
                </div>
                {view.metrics.cash?.value == null && (
                  <p className="mt-3 text-sm text-muted">
                    {view.metrics.cash?.reason ||
                      "مانده معتبر بانک موجود نیست."}
                  </p>
                )}
              </div>
              <Badge tone="primary">
                تا {displayDate(view.metrics.cash?.as_of_date)}
              </Badge>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4">
              {[
                {
                  key: "ar_invoice",
                  label: "مطالبات فاکتوری",
                  href: "/receivables",
                  icon: UsersThreeIcon,
                },
                {
                  key: "ap_invoice",
                  label: "بدهی فاکتوری",
                  href: "/payables",
                  icon: ReceiptIcon,
                },
              ].map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="group -m-2 rounded-control p-2 outline-none transition-colors duration-200 ease-interface hover:bg-surface/80 focus-visible:bg-surface/80 focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
                >
                  <p className="flex items-center gap-2 text-xs text-muted group-hover:text-primary group-focus-visible:text-primary">
                    <item.icon size={18} aria-hidden className="text-primary" />
                    {item.label}
                    <ArrowUpLeftIcon
                      size={14}
                      className="ms-auto shrink-0 text-primary"
                      aria-hidden
                    />
                  </p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-2">
                    <span className="text-metric font-medium tabular-nums">
                      {amount(view.metrics[item.key]?.value, unit)}
                    </span>
                    <span className="text-xs text-muted">
                      {unit === "IRR" ? "ریال" : "تومان"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
          <StatCards
            metrics={view.manifest.metrics}
            items={[
              { key: "revenue", label: "درآمد دفتر" },
              { key: "expense", label: "هزینه دفتر" },
              { key: "net_profit", label: "سود خالص" },
            ]}
          />
          <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
            <Panel
              title="مسیر نقدینگی"
              action={
                <ButtonLink
                  href="/cashflow"
                  variant="ghost"
                  className="px-3 text-xs text-primary"
                >
                  جزئیات
                  <ArrowUpLeftIcon size={16} aria-hidden />
                </ButtonLink>
              }
            >
              <CashChart
                unit={unit}
                days={view.manifest.details.daily_cash || []}
              />
            </Panel>
            <Panel
              title="اولویت رسیدگی"
              action={
                <ButtonLink
                  href="/review"
                  variant="ghost"
                  className="px-3 text-xs text-primary"
                >
                  مشاهده همه
                  <ArrowUpLeftIcon size={16} aria-hidden />
                </ButtonLink>
              }
            >
              {view.findings.length ? (
                <div className="divide-y divide-border">
                  {view.findings.map((finding) => (
                    <Link
                      key={finding.id}
                      href="/review"
                      className="group flex min-h-11 items-center justify-between gap-3 rounded-control px-3 py-4 outline-none transition-colors duration-200 ease-interface hover:bg-primary-soft/50 focus-visible:bg-primary-soft/50 focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
                    >
                      <span>{finding.title}</span>
                      <ArrowUpLeftIcon
                        size={18}
                        className="shrink-0 text-primary"
                      />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState compact title="مورد بازی برای بررسی نیست" />
              )}
            </Panel>
          </div>
        </>
      )}
      {view.sessions.length > 0 && (
        <Panel title="آخرین نوبت‌ها" className="mt-5">
          <div className="divide-y divide-border">
            {view.sessions.map((session) => (
              <Link
                key={session.id}
                href={`/uploads/${session.id}`}
                className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-control px-3 py-3 outline-none transition-colors duration-200 ease-interface hover:bg-primary-soft/50 focus-visible:bg-primary-soft/50 focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
              >
                <span className="flex items-center gap-2">
                  <ClockCounterClockwiseIcon
                    size={18}
                    className="shrink-0 text-primary"
                    aria-hidden
                  />
                  {displayDate(session.created_at)}
                </span>
                <StatusBadge status={session.state} />
              </Link>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

export function DashboardView() {
  const workspace = useWorkspace();
  const setup = useResource<{ mode: "analysis" | "primary" }>(
    workspace.companyPath("accounting/setup"),
  );
  if (!workspace.company) return <NoCompany />;
  if (setup.loading)
    return (
      <>
        <PageHeader title="خلاصه مالی" icon={HeaderIcon} />
        <LoadingState />
      </>
    );
  if (setup.error)
    return <ErrorState message={setup.error.message} onRetry={setup.refresh} />;
  return setup.data?.mode === "primary" ? (
    <NativeDashboardView key={workspace.company.id} />
  ) : (
    <ImportedDashboardView key={workspace.company.id} />
  );
}
