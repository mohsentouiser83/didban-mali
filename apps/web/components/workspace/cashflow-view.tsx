"use client";
import { WalletIcon as HeaderIcon } from "@phosphor-icons/react";
import { DetailField } from "@/components/ui/field-layout";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { CashChart } from "@/components/ui/financial/financial-chart";
import { StatCards } from "@/components/ui/financial/stat-cards";
import {
  useCashDayNavigation,
  useFinancialView,
} from "@/hooks/use-financial-view";
import { amount, displayDate } from "@/lib/utils";
import {
  ArrowLeftIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ArrowsLeftRightIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import {
  NoCompany,
  NoResult,
  PageHeader,
  Panel,
  PeriodFilter,
} from "./page-parts";

export function CashflowView() {
  const view = useFinancialView();
  const {
    selected,
    setSelected,
    hasPreviousDay,
    hasNextDay,
    previousDay,
    nextDay,
  } = useCashDayNavigation(view.manifest?.details.daily_cash || []);
  const unit = view.workspace.unit;
  if (!view.workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader icon={HeaderIcon}
        title="نقدینگی دوره"
        action={
          <ButtonLink href="/cashflow/forecast" variant="secondary">
            پیش‌بینی ۳۰روزه
            <ArrowLeftIcon size={16} />
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
          <StatCards
            metrics={view.reportMetrics}
            items={[
              { key: "cash", label: "مانده بانک" },
              { key: "cash_inflow", label: "واریز بانک در دوره" },
              { key: "cash_outflow", label: "برداشت بانک در دوره" },
            ]}
          />
          <Panel title="مانده روزانه" className="mt-5">
            <CashChart
              unit={unit}
              days={view.manifest.details.daily_cash || []}
            />
            {!!view.manifest.details.daily_cash?.length && (
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
                <span className="text-sm text-muted">بررسی یک روز</span>
                <div className="flex max-w-full gap-2 overflow-x-auto">
                  {view.dayChoices.map((day) => (
                    <Button
                      key={day.date}
                      variant="secondary"
                      onClick={() => setSelected(day)}
                    >
                      {displayDate(day.date)}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </Panel>
          <Panel title="حساب‌های بانکی" className="mt-5">
            <div className="divide-y divide-border">
              {view.manifest.details.bank_balances?.length ? (
                view.manifest.details.bank_balances.map((bank) => (
                  <div
                    key={bank.account}
                    className="flex flex-wrap justify-between gap-3 py-3 first:pt-0"
                  >
                    <span>{bank.account}</span>
                    <div className="text-end">
                      <span className="tabular-nums">
                        {amount(bank.balance ?? bank.value, unit)}{" "}
                        {unit === "IRR" ? "ریال" : "تومان"}
                      </span>
                      {bank.reason && (
                        <p className="text-xs text-muted">{bank.reason}</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState compact title="حساب بانکی موجود نیست" />
              )}
            </div>
          </Panel>
        </>
      )}
      <Drawer
        footer={
          selected && (
            <div className="flex w-full items-center justify-between gap-3">
              <Button
                variant="secondary"
                disabled={!hasPreviousDay}
                onClick={previousDay}
              >
                <CaretRightIcon size={17} />
                روز قبل
              </Button>
              <Button
                variant="secondary"
                disabled={!hasNextDay}
                onClick={nextDay}
              >
                روز بعد
                <CaretLeftIcon size={17} />
              </Button>
            </div>
          )
        }
        title={selected ? `جزئیات ${displayDate(selected.date)}` : "جزئیات روز"}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        {selected && (
          <dl className="space-y-3">
            {[
              {
                label: "مانده پایان روز",
                value: selected.balance,
                icon: WalletIcon,
              },
              {
                label: "ورودی",
                value: selected.inflow,
                icon: ArrowDownLeftIcon,
              },
              {
                label: "خروجی",
                value: selected.outflow,
                icon: ArrowUpRightIcon,
              },
              {
                label: "خالص گردش",
                value: selected.net,
                icon: ArrowsLeftRightIcon,
              },
            ].map(({ label, value, icon }) => (
              <DetailField
                key={label}
                label={label}
                icon={icon}
                value={`${amount(value, unit)} ${unit === "IRR" ? "ریال" : "تومان"}`}
              />
            ))}
          </dl>
        )}
      </Drawer>
    </>
  );
}
