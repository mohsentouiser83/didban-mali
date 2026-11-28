"use client";
import { useEffect, useState } from "react";
import {
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  SquaresFourIcon as HeaderIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/content-states";
import { CashChart } from "@/components/ui/financial/financial-chart";
import { StatCards } from "@/components/ui/financial/stat-cards";
import { useWorkspace } from "@/hooks/workspace";
import { useCommand } from "@/hooks/use-command";
import { api } from "@/lib/api";
import type { ActiveDashboardResponse } from "@/lib/report-studio";
import { SectionRenderer } from "./report-studio/section-renderer";
import { NativeDashboardView } from "./native-dashboard-view";
import { useFinancialView } from "@/hooks/use-financial-view";
import { amount, displayDate } from "@/lib/utils";
import {
  UsersThreeIcon,
  ReceiptIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import {
  NoCompany,
  NoResult,
  PageHeader,
  Panel,
} from "./page-parts";

export function ImportedDashboardView() {
  const view = useFinancialView();
  const { unit } = view.workspace;
  if (!view.workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="داشبورد"
      />
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
                  icon: UsersThreeIcon,
                },
                {
                  key: "ap_invoice",
                  label: "بدهی فاکتوری",
                  icon: ReceiptIcon,
                },
              ].map((item) => (
                <div key={item.key}>
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <item.icon size={18} aria-hidden className="text-primary" />
                    {item.label}
                  </p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-2">
                    <span className="text-metric font-medium tabular-nums">
                      {amount(view.metrics[item.key]?.value, unit)}
                    </span>
                    <span className="text-xs text-muted">
                      {unit === "IRR" ? "ریال" : "تومان"}
                    </span>
                  </div>
                </div>
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
          <Panel title="مسیر نقدینگی" className="mt-5">
            <CashChart unit={unit} days={view.manifest.details.daily_cash || []} />
          </Panel>
        </>
      )}
    </>
  );
}

export function DashboardView() {
  const workspace = useWorkspace();
  if (!workspace.company) return <NoCompany />;
  return <CompanyDashboard key={workspace.company.id} />;
}

function CompanyDashboard() {
  const workspace = useWorkspace();
  const command = useCommand();
  const [activeDashboard, setActiveDashboard] =
    useState<ActiveDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"custom" | "native">("custom");

  const companyId = workspace.company?.id;
  const periodId = workspace.periodId;

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    const path = workspace.companyPath("report-studio/active-dashboard");
    if (!path) return;
    const query = periodId ? `?period_id=${encodeURIComponent(periodId)}` : "";
    api<ActiveDashboardResponse>(path + query)
      .then((data) => {
        if (active) {
          setActiveDashboard(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setActiveDashboard(null);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [companyId, periodId, workspace]);

  function handleReset() {
    if (!workspace.company) return;
    void command.run(
      workspace.companyPath("report-studio/active-dashboard/reset"),
      { method: "POST" },
      () => {
        setActiveDashboard(null);
        setViewMode("native");
      },
      "داشبورد اصلی به وضعیت پیش‌فرض دیدبان بازنشانی شد.",
    );
  }

  if (!workspace.company) return <NoCompany />;

  if (loading) {
    return <LoadingState label="بارگذاری داشبورد مالی..." />;
  }

  const hasCustom = Boolean(
    activeDashboard?.has_custom_dashboard && activeDashboard.dashboard,
  );

  if (activeDashboard?.error && viewMode === "custom") {
    return (
      <Panel>
        <ErrorState message={activeDashboard.error} />
        <Button variant="ghost" onClick={() => setViewMode("native")}>داشبورد استاندارد دیدبان</Button>
      </Panel>
    );
  }

  if (hasCustom && viewMode === "custom" && activeDashboard?.dashboard) {
    const dash = activeDashboard.dashboard;
    return (
      <div className="space-y-6">
        <PageHeader
          icon={SquaresFourIcon}
          title={
            dash.title || activeDashboard.definition_name || "داشبورد اختصاصی"
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary" className="gap-1 font-medium">
                <CheckCircleIcon size={14} />
                {activeDashboard.mode === "fixed" ? "نسخهٔ ثابت" :
                  activeDashboard.mode === "live" ? "نمای زنده" : "داشبورد اختصاصی"}
              </Badge>

              <Button
                variant="ghost"
                onClick={() => setViewMode("native")}
                className="gap-1.5 text-xs text-muted hover:text-foreground"
                title="مشاهده داشبورد استاندارد دفتر کل دیدبان"
              >
                داشبورد استاندارد دیدبان
              </Button>

              {workspace.canWrite && (
                <Button
                  variant="ghost"
                  disabled={command.busy}
                  onClick={handleReset}
                  className="gap-1 text-xs text-muted hover:text-destructive"
                  title="حذف داشبورد اختصاصی و بازگشت به داشبورد پیش‌فرض"
                >
                  <ArrowCounterClockwiseIcon size={15} />
                  بازنشانی به پیش‌فرض
                </Button>
              )}
            </div>
          }
        >
          {dash.as_of && dash.basis_label && (
            <p className="mt-1 text-xs text-muted">
              {dash.basis_label} · {displayDate(dash.as_of)}
            </p>
          )}
        </PageHeader>

        {dash.sections && dash.sections.length > 0 ? (
          <div className="space-y-6">
            {dash.sections.map((section, idx) => (
              <SectionRenderer
                key={section.id || idx}
                section={section}
                index={idx}
                readOnly={true}
              />
            ))}
          </div>
        ) : (
          <Panel>
            <EmptyState
              title="بخش یا ویجتی در این داشبورد تعریف نشده است"
            />
          </Panel>
        )}
      </div>
    );
  }

  return (
    <div>
      {hasCustom && (
        <div className="mb-4 flex justify-end">
          <Button
            variant="ghost"
            onClick={() => setViewMode("custom")}
            className="px-2.5 py-1 text-xs text-primary hover:bg-primary/10"
          >
            مشاهده داشبورد اختصاصی
          </Button>
        </div>
      )}
      <NativeDashboardView key={workspace.company.id} />
    </div>
  );
}
