"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Activity,
  ChevronLeft,
  FileCheck2,
  RefreshCw,
  Receipt,
  TrendingDown,
  TrendingUp,
  WalletCards,
  type AppIcon,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MoneyDisplay,
  toJalaliDate,
  toPersianDigits,
} from "@/components/ui/financial";
import { api } from "@/lib/product-api";
import type {
  ExecutiveDashboardResponse,
  KeyChangeItem,
  MetricResultDTO,
  MetricStatus,
} from "@/lib/product-types";
import { MetricEvidenceDrawer } from "./metric-evidence-drawer";
import { DashboardForecast } from "./dashboard-forecast";

const STATUS_TAGS: Record<MetricStatus, { label: string; className: string }> =
  {
    available: { label: "قابل اتکا", className: "dashboard-state-neutral" },
    available_with_warning: {
      label: "دارای ملاحظات",
      className: "dashboard-state-warning",
    },
    approximate: { label: "برآورد مدلی", className: "dashboard-state-info" },
    insufficient_data: {
      label: "دادهٔ ناکافی",
      className: "dashboard-state-warning",
    },
    not_applicable: {
      label: "غیرقابل‌اعمال",
      className: "dashboard-state-neutral",
    },
  };

export function ExecutiveCalculationPanel({
  companyId,
  dashboard,
  onRefresh,
  loading = false,
  reviewPanel,
}: {
  companyId: string;
  dashboard: ExecutiveDashboardResponse | null;
  onRefresh: () => Promise<void>;
  loading?: boolean;
  reviewPanel?: ReactNode;
}) {
  const [recalculating, setRecalculating] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<MetricResultDTO | null>(
    null,
  );
  async function recalculate() {
    setRecalculating(true);
    try {
      await api(`/companies/${companyId}/calculations/run`, { method: "POST" });
      await onRefresh();
      toast.success(
        "محاسبات مالی بر اساس آخرین داده‌های تأییدشده به‌روزرسانی شد.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "محاسبات به‌روزرسانی نشد. دوباره تلاش کنید.",
      );
    } finally {
      setRecalculating(false);
    }
  }
  const kpis = dashboard?.primary_kpis ?? {};
  const definitions: { key: string; title: string; icon: AppIcon }[] = [
    { key: "cash_position", title: "موجودی نقد", icon: WalletCards },
    { key: "open_receivables", title: "مطالبات باز", icon: Receipt },
    { key: "open_payables", title: "بدهی‌های باز", icon: FileCheck2 },
    {
      key: kpis.runway ? "runway" : "cash_forecast_13w",
      title: kpis.runway ? "تاب‌آوری نقد" : "کمترین مانده نقد در ۱۳ هفته",
      icon: Activity,
    },
  ];
  return (
    <div
      className="dashboard-executive"
      aria-busy={loading || recalculating}
    >
      <section className="dashboard-position" aria-labelledby="dashboard-position-title">
        <div className="dashboard-section-heading">
          <div>
            <h2 id="dashboard-position-title">موقعیت مالی فعلی</h2>
            <p>
              {dashboard ? (
                <>
                  داده تا {toJalaliDate(dashboard.as_of_date)} · مستقل از دورهٔ یافته‌ها
                </>
              ) : (
                "آخرین داده‌های تأییدشده"
              )}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void recalculate()}
            disabled={recalculating || loading}
            aria-busy={recalculating}
            className="dashboard-button"
          >
            <RefreshCw
              className={
                recalculating || loading ? "size-4 animate-spin" : "size-4"
              }
            />
            {recalculating
              ? "در حال محاسبه…"
              : dashboard
                ? "به‌روزرسانی شاخص‌ها"
                : "محاسبه شاخص‌ها"}
          </Button>
        </div>
        {loading && !dashboard ? (
          <div className="dashboard-kpis">
            {definitions.map((item) => (
              <Skeleton key={item.key} className="h-40 rounded-[var(--ds-card-radius)]" />
            ))}
          </div>
        ) : (
          <div className="dashboard-kpis">
            {definitions.map(({ key, title, icon: Icon }, index) => (
              <CalculationKpiCard
                key={key}
                metric={kpis[key]}
                title={title}
                icon={Icon}
                featured={index === 0}
                onOpenEvidence={() => setSelectedMetric(kpis[key] ?? null)}
              />
            ))}
          </div>
        )}
        {dashboard?.freshness?.sources?.some((source) => source.is_stale) ? (
          <div className="dashboard-freshness">
            {dashboard.freshness.sources.filter((source) => source.is_stale).map((source) => (
              <span
                key={source.source_kind}
                className={`dashboard-source ${source.is_stale ? "dashboard-source-stale" : ""}`}
                title={
                  source.last_record_date
                    ? `آخرین داده: ${toJalaliDate(source.last_record_date)}`
                    : "داده‌ای ثبت نشده است"
                }
              >
                <span aria-hidden="true" />
                {source.title_fa} ·{" "}
                {source.is_stale
                  ? `${source.days_stale == null ? "—" : toPersianDigits(source.days_stale)} روز قدیمی`
                  : "به‌روز"}
              </span>
            ))}
          </div>
        ) : null}
        {definitions.some(({ key }) => kpis[key]?.warnings?.length) && (
          <div className="dashboard-warning-list" aria-label="ملاحظات داده‌های مالی">
            {definitions.filter(({ key }) => kpis[key]?.warnings?.length).map(({ key, title }) => (
              <div key={key} className="dashboard-warning-item">
                <div><strong>{title}</strong><p>{warningSummary(kpis[key].warnings[0])}</p></div>
                <Button variant="outline" size="sm" onClick={() => setSelectedMetric(kpis[key])}>بررسی ملاحظات<ChevronLeft size={14} /></Button>
              </div>
            ))}
          </div>
        )}
      </section>
      {(dashboard || reviewPanel) && (
        <>
        <div className="dashboard-insights dashboard-review-layout">
          {reviewPanel}
          {dashboard?.forecast_outlook?.weeks?.length ? (
            <DashboardForecast outlook={dashboard!.forecast_outlook} asOfDate={dashboard!.as_of_date} />
          ) : (
            <section className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <h2>دورنمای نقدینگی</h2>
              </div>
              <p className="dashboard-empty-note">
                پیش‌بینی نقدینگی هنوز آماده نیست. داده‌های فروش و تعهدات را
                تکمیل کنید.
              </p>
            </section>
          )}

        </div>
        <details className="dashboard-changes-details"><summary>تغییرات آخرین محاسبه نسبت به دورهٔ قبل</summary>
          <section
            className="dashboard-panel dashboard-changes"
            aria-labelledby="dashboard-changes-title"
          >
            <div className="dashboard-panel-heading">
              <div>
                <h2 id="dashboard-changes-title">تغییرات مهم</h2>
                <p>محاسبهٔ فعلی؛ مستقل از دورهٔ یافته‌ها</p>
              </div>
            </div>
            <div className="dashboard-change-list">
              {dashboard?.key_changes?.length ? (
                dashboard!.key_changes.slice(0, 3).map((change, index) => (
                  <div
                    key={`${change.metric_key}-${index}`}
                    className="dashboard-change"
                    title={toPersianDigits(change.change_statement)}
                  >
                    <span
                      className={`dashboard-change-icon ${change.severity === "positive" ? "is-positive" : change.severity === "warning" || change.severity === "critical" ? "is-warning" : ""}`}
                    >
                      {change.direction === "decrease" ? (
                        <TrendingDown size={20} />
                      ) : (
                        <TrendingUp size={20} />
                      )}
                    </span>
                    <div>
                      <strong>{change.title_fa}</strong>
                      <p className="dashboard-change-value">
                        <ChangeValue change={change} />
                      </p>

                    </div>
                  </div>
                ))
              ) : (
                <p className="dashboard-empty-note">
                  تغییر قابل‌مقایسه‌ای ثبت نشده است.
                </p>
              )}
            </div>
          </section>
        </details>
        </>
      )}
      <MetricEvidenceDrawer
        open={!!selectedMetric}
        onOpenChange={(open) => {
          if (!open) setSelectedMetric(null);
        }}
        companyId={companyId}
        metric={selectedMetric}
      />
    </div>
  );
}

function warningSummary(warning: string) {
  const missingDueDates = warning.match(/تعداد\s+(\d+)\s+سند.*فاقد تاریخ سررسید/);
  if (missingDueDates) return `${toPersianDigits(missingDueDates[1])} سند فاقد تاریخ سررسید است؛ زمان‌بندی پرداخت‌ها نیاز به تکمیل داده دارد.`;
  const overdueInvoices = warning.match(/مبلغ\s+([\d,٬]+)\s+ریال مربوط به\s+(\d+)\s+فاکتور معوق/);
  if (overdueInvoices) return <>{toPersianDigits(overdueInvoices[2])} فاکتور معوق به مبلغ <MoneyDisplay amount={overdueInvoices[1].replace(/[,٬]/g, "")} executive direction="neutral" size="sm" /> تاریخ وصول مشخص ندارد و در جریان قطعی هفتگی لحاظ نشده است.</>;
  return toPersianDigits(warning);
}

function CalculationKpiCard({
  metric,
  title,
  icon: Icon,
  featured,
  onOpenEvidence,
}: {
  metric?: MetricResultDTO;
  title: string;
  icon: AppIcon;
  featured: boolean;
  onOpenEvidence: () => void;
}) {
  const tag = metric
    ? STATUS_TAGS[metric.status]
    : { label: "محاسبه نشده", className: "dashboard-state-neutral" };
  const unit = metric?.unit.toLowerCase();
  const available =
    metric &&
    metric.status !== "insufficient_data" &&
    metric.status !== "not_applicable" &&
    metric.value_numeric != null;
  return (
    <article
      className={`dashboard-kpi ${featured ? "dashboard-kpi-featured" : ""}`}
    >
      <h3>{title}</h3>
      <div className="dashboard-kpi-value">
        {available ? (
          unit === "irr" || unit === "toman" ? (
            <MoneyDisplay
              direction="neutral"
              amount={metric.value_numeric}
              currency={unit === "toman" ? "تومان" : "ریال"}
              executive
              size="lg"
              className="dashboard-kpi-money"
            />
          ) : (
            <>
              <strong>{toPersianDigits(metric.value_numeric!)}</strong>
              <span>
                {unit === "day"
                  ? "روز"
                  : unit === "month"
                    ? "ماه"
                    : unit === "percent"
                      ? "درصد"
                      : ""}
              </span>
            </>
          )
        ) : (
          <span className="dashboard-kpi-unavailable">
            {metric?.status === "not_applicable"
              ? "غیرقابل‌اعمال"
              : metric?.status === "insufficient_data"
                ? "داده ناکافی"
                : "—"}
          </span>
        )}
      </div>
      <div className="dashboard-kpi-footer">
      <Button
        variant="surface"
        size="auto"
        motion="none"
        type="button"
        className="dashboard-evidence-link"
        onClick={onOpenEvidence}
        disabled={!metric}
        aria-label={`مشاهدهٔ شواهد ${title}`}
      >
        شواهد
        <ChevronLeft size={16} />
      </Button>
        {metric && metric.status !== "available" && <span className={`dashboard-metric-note ${tag.className}`}>{tag.label}</span>}
      </div>
    </article>
  );
}

function ChangeValue({ change }: { change: KeyChangeItem }) {
  const { current_value: current, previous_value: previous } = change;
  if (current == null || previous == null || change.direction === "not_comparable") {
    return toPersianDigits(change.change_statement);
  }
  const unit = change.unit.toLowerCase();
  const delta = current - previous;
  if (["irr", "toman", "ریال", "تومان"].includes(unit)) {
    return <MoneyDisplay amount={delta} currency={unit === "toman" || unit === "تومان" ? "تومان" : "ریال"} executive showSign direction="neutral" size="sm" />;
  }
  if (["percent", "درصد"].includes(unit) && previous !== 0) {
    const percent = delta / Math.abs(previous) * 100;
    return <span dir="ltr">{percent > 0 ? "+" : ""}{toPersianDigits(percent.toFixed(1))}٪</span>;
  }
  if (["day", "روز"].includes(unit)) {
    return <span dir="ltr">{delta > 0 ? "+" : ""}{toPersianDigits(delta.toFixed(1))} روز</span>;
  }
  return toPersianDigits(change.change_statement);
}
