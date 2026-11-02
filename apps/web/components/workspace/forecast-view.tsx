"use client";
import { TrendUpIcon as HeaderIcon } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import { CashChart } from "@/components/ui/financial/financial-chart";
import { Select } from "@/components/ui/select";
import { useScenarioSource } from "@/hooks/use-scenario-source";
import { NativeForecastWorkspace } from "./native-forecast-workspace";
import { useFinancialView } from "@/hooks/use-financial-view";
import { amount, displayDate } from "@/lib/utils";
import {
  NoCompany,
  NoResult,
  PageHeader,
  Panel,
  PeriodFilter,
} from "./page-parts";

function ImportedForecastWorkspace() {
  const view = useFinancialView("forecast");
  const forecast = view.manifest?.details.forecast;
  const unit = view.workspace.unit;
  if (!view.workspace.company) return <NoCompany />;
  return (
    <>
      <PeriodFilter />
      {view.loading ? (
        <LoadingState />
      ) : view.error ? (
        <ErrorState message={view.error.message} onRetry={view.refresh} />
      ) : !view.manifest ? (
        <NoResult />
      ) : (
        <Panel
          title="مسیر برآوردی نقد"
          action={forecast && <StatusBadge status={forecast.status} />}
        >
          {!forecast || forecast.status === "unavailable" ? (
            <EmptyState
              title="پیش‌بینی آماده نیست"
              description={
                forecast?.reason ||
                "مانده معتبر بانک و زمان دریافت و پرداخت لازم است."
              }
            />
          ) : (
            <>
              <div className="mb-6 flex flex-wrap justify-between gap-4">
                <div>
                  <p className="text-muted">مانده پایان افق</p>
                  <p className="mt-2 font-display text-cash-view font-medium tabular-nums">
                    {amount(forecast.closing, unit)}
                    <span className="ms-2 font-body text-sm text-muted">
                      {unit === "IRR" ? "ریال" : "تومان"}
                    </span>
                  </p>
                </div>
              </div>
              <CashChart
                unit={unit}
                days={forecast.days || []}
                label="مانده برآوردی ۳۰ روز آینده"
              />
              {forecast.reason && (
                <StatusMessage>{forecast.reason}</StatusMessage>
              )}
              {view.forecastAssumptions.length > 0 && (
                <ul className="mt-5 space-y-2 text-sm text-muted">
                  {view.forecastAssumptions.map((assumption, index) => (
                    <li key={index}>{assumption}</li>
                  ))}
                </ul>
              )}
              <div className="mt-5 divide-y divide-border">
                {forecast.events?.map((event, index) => (
                  <div
                    key={index}
                    className="flex flex-wrap justify-between gap-3 py-3"
                  >
                    <span>{displayDate(event.date)}</span>
                    <span>
                      {event.direction === "receipt"
                        ? "دریافت برآوردی"
                        : "پرداخت برنامه‌ای"}
                    </span>
                    <span className="tabular-nums">
                      {amount(event.amount, unit)}{" "}
                      {unit === "IRR" ? "ریال" : "تومان"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      )}
    </>
  );
}

export function ForecastView() {
  const { workspace, setup, scope, basis, select } = useScenarioSource();
  if (!workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="پیش‌بینی ۳۰روزه"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/cashflow/scenarios" variant="secondary">
              سناریوها
            </ButtonLink>
            <ButtonLink href="/settlements/plans" variant="secondary">
              برنامه پرداخت
            </ButtonLink>
          </div>
        }
      />
      <div className="mb-5">
        <Select
          label="مبنای پیش‌بینی"
          value={basis}
          onValueChange={select}
          options={[
            { value: "native_statement", label: "دفتر اصلی دیدبان" },
            { value: "imported_manifest", label: "منابع واردشده" },
          ]}
        />
      </div>
      {setup.loading ? (
        <LoadingState />
      ) : setup.error ? (
        <ErrorState message={setup.error.message} onRetry={setup.refresh} />
      ) : basis === "native_statement" ? (
        <NativeForecastWorkspace key={scope} />
      ) : (
        <ImportedForecastWorkspace key={scope} />
      )}
    </>
  );
}
