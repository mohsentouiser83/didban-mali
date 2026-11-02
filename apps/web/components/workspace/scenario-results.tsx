"use client";
import { CashChart } from "@/components/ui/financial/financial-chart";
import { StatCards } from "@/components/ui/financial/stat-cards";
import {
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import type { CashScenario, ScenarioEvaluation } from "@/lib/cash-scenarios";
import type { Metric, ApiError } from "@/lib/api";
interface ScenarioResultsController {
  local: {
    item:
      | (Pick<CashScenario, "version" | "comparison"> & {
          baseline: {
            as_of_date: string;
            end: string;
            forecast_run_id?: string;
          };
        })
      | null;
  };
  comparisonMetrics: Metric[];
  view: { workspace: { unit: "IRR" | "TOMAN" } };
  evaluation: {
    loading: boolean;
    error?: ApiError;
    refresh: () => void;
    data?: Pick<
      ScenarioEvaluation,
      "status" | "reason" | "closing_error" | "days"
    >;
  };
}
import { amount, displayDate } from "@/lib/utils";
import { Panel } from "./page-parts";
export function ScenarioResults({
  controller: c,
  native = false,
}: {
  controller: ScenarioResultsController;
  native?: boolean;
}) {
  const item = c.local.item;
  if (!item) return null;
  const { baseline, scenario } = item.comparison;
  const limited = native && item.comparison.status === "limited";
  const deficit = limited
    ? (scenario.known_dated_first_deficit ?? scenario.first_deficit)
    : scenario.first_deficit;
  const baselineTitle = limited
    ? "جریان‌های تاریخ‌دار معلوم مبنا"
    : native && !item.baseline.forecast_run_id
      ? "مبنای بدون جریان جدید"
      : "پیش‌بینی مبنا";
  return (
    <div className="space-y-5">
      <Panel title="نتیجه نسخه ذخیره‌شده">
        <p className="mb-4 text-sm text-muted">
          نسخه {item.version.toLocaleString("fa-IR")} · مبنا{" "}
          {displayDate(item.baseline.as_of_date)} تا{" "}
          {displayDate(item.baseline.end)}
        </p>
        <StatCards
          showComparison={false}
          items={[
            {
              key: "scenario_closing",
              label: limited
                ? "ماندهٔ جریان‌های معلوم سناریو"
                : "مانده پایان سناریو",
            },
            {
              key: "scenario_minimum",
              label: limited
                ? "کمترین ماندهٔ جریان‌های معلوم"
                : "کمترین مانده سناریو",
            },
            {
              key: "scenario_difference",
              label: limited
                ? "تفاوت جریان‌های معلوم با مبنا"
                : "تفاوت پایان با مبنا",
            },
          ]}
          metrics={c.comparisonMetrics}
        />
        <p className="mt-4">
          {limited ? "نخستین کسریِ مسیر معلوم:" : "اولین کسری:"}{" "}
          {deficit
            ? displayDate(deficit)
            : limited
              ? "در مسیر معلوم رخ نمی‌دهد"
              : "در افق سناریو رخ نمی‌دهد"}
        </p>
      </Panel>
      {limited && (
        <StatusMessage tone="warning">
          مانده و کمترین ماندهٔ کامل سناریو نامشخص است؛ ارقام و نمودارها فقط
          جریان‌های تاریخ‌دار معلوم را پوشش می‌دهند.
        </StatusMessage>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={baselineTitle}>
          <CashChart
            days={baseline.days}
            unit={c.view.workspace.unit}
            label={baselineTitle}
          />
        </Panel>
        <Panel title={limited ? "جریان‌های تاریخ‌دار معلوم سناریو" : "سناریو"}>
          <CashChart
            days={scenario.days}
            unit={c.view.workspace.unit}
            label={
              limited
                ? "ماندهٔ جریان‌های تاریخ‌دار معلوم سناریو"
                : "مانده سناریوی فرضی"
            }
          />
        </Panel>
      </div>
      {scenario.excluded_events.length > 0 && (
        <Panel title="رویدادهای خارج از افق">
          <StatusMessage>
            این رویدادها در مانده افق سناریو محاسبه نشده‌اند.
          </StatusMessage>
          <Table aria-label="رویدادهای خارج از افق سناریو">
            <TableHeader>
              <TableRow>
                <TableHead>رویداد</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>مبلغ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenario.excluded_events.map((event) => (
                <TableRow key={event.event_id}>
                  <TableRowHeader>
                    {event.label || event.obligation_id || "رویداد مبنا"}
                  </TableRowHeader>
                  <TableCell>{displayDate(event.date)}</TableCell>
                  <TableCell>
                    {amount(event.amount, c.view.workspace.unit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
      <Panel
        title={
          native
            ? "سنجش سناریو با ماندهٔ واقعی پایان افق"
            : "سنجش پیش‌بینی مبنا با گردش واقعی"
        }
      >
        {c.evaluation.loading ? (
          <LoadingState />
        ) : c.evaluation.error ? (
          <ErrorState
            message={c.evaluation.error.message}
            onRetry={c.evaluation.refresh}
          />
        ) : c.evaluation.data?.status === "available" ? (
          <>
            <p>
              اختلاف مانده واقعی و {native ? "سناریو" : "پیش‌بینی"} در پایان
              افق:{" "}
              {amount(c.evaluation.data.closing_error, c.view.workspace.unit)}{" "}
              {c.view.workspace.unit === "IRR" ? "ریال" : "تومان"}
            </p>
            {!native && (
              <Table aria-label="خطای روزانه پیش‌بینی">
                <TableHeader>
                  <TableRow>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>پیش‌بینی</TableHead>
                    <TableHead>واقعی</TableHead>
                    <TableHead>اختلاف</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.evaluation.data.days.map((day) => (
                    <TableRow key={day.date}>
                      <TableRowHeader>{displayDate(day.date)}</TableRowHeader>
                      <TableCell>
                        {amount(day.predicted, c.view.workspace.unit)}
                      </TableCell>
                      <TableCell>
                        {amount(day.actual, c.view.workspace.unit)}
                      </TableCell>
                      <TableCell>
                        {amount(day.error, c.view.workspace.unit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        ) : (
          <StatusMessage>
            {c.evaluation.data?.reason || "گردش واقعی قابل مقایسه موجود نیست."}
          </StatusMessage>
        )}
      </Panel>
    </div>
  );
}
