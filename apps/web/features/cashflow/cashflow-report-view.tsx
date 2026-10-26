import type { ReactNode } from "react";
import { PageHeader } from "@/features/companies/company-view";
import { Button } from "@/components/ui/button";
import { Select, type Option } from "@/components/ui/select";
import { StatCard, StatCards } from "@/components/ui/financial/stat-cards";
import {
  FinancialChart,
  ChartTooltip,
} from "@/components/ui/financial/financial-chart";
import { EmptyState, StatusMessage } from "@/components/ui/states";
import type {
  CashflowReportModel,
  CashflowDayModel,
} from "./cashflow-report-presentation";
export function CashflowReportView({
  company,
  manifest,
  options,
  onManifest,
  moreManifests,
  manifestBusy,
  onMoreManifests,
  unit,
  model,
  day,
  dayIndex,
  onDay,
  onPrevious,
  onNext,
  onDetails,
  onAccounts,
  frozenAt,
  reasons,
  extra,
}: {
  company: string;
  manifest: string;
  options: Option[];
  onManifest: (id: string) => void;
  moreManifests: boolean;
  manifestBusy: boolean;
  onMoreManifests: () => void;
  unit: string;
  model: CashflowReportModel;
  day: CashflowDayModel | undefined;
  dayIndex: number;
  onDay: (date: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onDetails: () => void;
  onAccounts: () => void;
  frozenAt: string | null;
  reasons: string[];
  extra?: ReactNode;
}) {
  return (
    <section className="space-y-6 motion-safe:animate-reveal">
      <PageHeader
        title="گزارش گردش نقد"
        description={company}
        action={
          <Button variant="secondary" onClick={onAccounts}>
            حساب‌های بانکی
          </Button>
        }
      />
      <div className="rounded-panel border border-border bg-surface p-5">
        <label
          htmlFor="cashflow-manifest"
          className="mb-2 block text-xs font-medium"
        >
          نسخه داده
        </label>
        <Select
          id="cashflow-manifest"
          label="نسخه داده"
          value={manifest}
          options={options}
          onValueChange={onManifest}
        />
        {moreManifests ? (
          <Button
            variant="ghost"
            onClick={onMoreManifests}
            disabled={manifestBusy}
          >
            {manifestBusy ? "در حال دریافت" : "نسخه‌های بیشتر"}
          </Button>
        ) : null}
        {frozenAt ? (
          <p className="mt-3 text-xs text-muted">
            مبنای تطبیق: تصمیم‌های زمان تولید این گزارش · {frozenAt}
          </p>
        ) : null}
      </div>
      {extra}
      {reasons.map((r) => (
        <StatusMessage key={r}>{r}</StatusMessage>
      ))}
      <StatCards>
        {model.metrics.map((m) => (
          <StatCard key={m.key} title={m.title} value={m.value} unit={unit}>
            {m.missing ? (
              <p className="text-xs text-muted">{m.reason}</p>
            ) : null}
          </StatCard>
        ))}
      </StatCards>
      <section className="space-y-5 rounded-panel border border-border bg-surface p-5 sm:p-7">
        <h2 className="font-medium">روند مانده ثبت‌شده</h2>
        {model.chart.points.length ? (
          <FinancialChart
            label="روند مانده روزانه حساب‌ها"
            data={model.chart}
            selectedIndex={dayIndex}
          />
        ) : (
          <EmptyState title="مانده روزانه قابل محاسبه نیست" />
        )}
        {day ? (
          <>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div>
                <label
                  htmlFor="cashflow-day"
                  className="mb-2 block text-xs font-medium"
                >
                  روز گزارش
                </label>
                <Select
                  id="cashflow-day"
                  label="روز گزارش"
                  value={model.options[dayIndex]?.value ?? ""}
                  options={model.options}
                  onValueChange={onDay}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  variant="secondary"
                  onClick={onPrevious}
                  disabled={dayIndex <= 0}
                >
                  روز قبل
                </Button>
                <Button
                  variant="secondary"
                  onClick={onNext}
                  disabled={dayIndex >= model.options.length - 1}
                >
                  روز بعد
                </Button>
              </div>
            </div>
            <ChartTooltip label="خلاصه روز انتخاب‌شده">
              <div
                key={day.date}
                className="space-y-3 motion-safe:animate-reveal"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <p className="font-medium">{day.date}</p>
                  <p>
                    مانده پایان روز:{" "}
                    <bdi className="tabular-nums">{day.closing}</bdi> {unit}
                  </p>
                </div>
                {day.reasons.slice(0, 2).map((r) => (
                  <p key={r} className="text-xs text-muted">
                    {r}
                  </p>
                ))}
                <Button variant="secondary" onClick={onDetails}>
                  جزئیات گردش این روز
                </Button>
              </div>
            </ChartTooltip>
          </>
        ) : null}
      </section>
    </section>
  );
}
