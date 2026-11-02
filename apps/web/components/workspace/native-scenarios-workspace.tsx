"use client";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { CursorPagination } from "@/components/ui/pagination";
import {
  ErrorState,
  LoadingState,
  EmptyState,
  StatusMessage,
} from "@/components/ui/content-states";
import { useNativeCashScenarios } from "@/hooks/use-native-cash-scenarios";
import { displayDate } from "@/lib/utils";
import { Panel } from "./page-parts";
import { ScenarioForm } from "./scenario-form";
import { ScenarioResults } from "./scenario-results";
export function NativeScenariosWorkspace() {
  const c = useNativeCashScenarios();
  return (
    <div className="space-y-5">
      <Panel
        title="سناریوهای دفتر اصلی"
        action={
          <Button variant="secondary" onClick={c.startNew}>
            سناریوی تازه
          </Button>
        }
      >
        {c.list.loading ? (
          <LoadingState />
        ) : c.list.error ? (
          <ErrorState message={c.list.error.message} onRetry={c.list.refresh} />
        ) : c.list.data?.items.length ? (
          <>
            <Select
              label="نسخهٔ ذخیره‌شده"
              value={c.local.item?.id || ""}
              onValueChange={c.select}
              options={c.list.data.items.map((row) => ({
                value: row.id,
                label: `${row.name} · نسخه ${row.version.toLocaleString("fa-IR")}`,
              }))}
            />
            <CursorPagination {...c.list} />
          </>
        ) : (
          <EmptyState compact title="سناریویی ذخیره نشده" />
        )}
      </Panel>
      <Panel title="مبنای ثابت سناریو">
        <div className="space-y-4">
          <StatusMessage>
            مانده از گزارش ثابت است؛ دریافت و پرداخت آینده را خودتان تعیین
            می‌کنید. سناریو سند یا تعهد ایجاد نمی‌کند.
          </StatusMessage>
          {!c.local.item && (
            <Select
              label="نوع مبنای سناریو"
              value={c.sourceMode}
              onValueChange={c.setSourceMode}
              options={[
                { value: "manual", label: "ماندهٔ نقد و فرض‌های دستی" },
                { value: "forecast", label: "پیش‌بینی خودکار ذخیره‌شده" },
              ]}
            />
          )}
          {c.local.item ? (
            <p>
              {displayDate(c.local.item.baseline.as_of_date)} تا{" "}
              {displayDate(c.local.item.baseline.end)}
            </p>
          ) : c.sourceMode === "forecast" ? (
            c.forecasts.loading ? (
              <LoadingState />
            ) : c.forecasts.error ? (
              <ErrorState
                message={c.forecasts.error.message}
                onRetry={c.forecasts.refresh}
              />
            ) : c.forecasts.data?.items.length ? (
              <>
                <Select
                  label="پیش‌بینی ثابت مبنا"
                  value={c.local.forecastId}
                  onValueChange={(forecastId) =>
                    c.set({ forecastId, statementId: "" })
                  }
                  options={c.forecasts.data.items.map((row) => ({
                    value: row.id,
                    label: `${displayDate(row.as_of)} · ${row.status === "limited" ? "محدود" : "برآوردی"} · ${row.id.slice(0, 8)}`,
                  }))}
                />
                <CursorPagination {...c.forecasts} />
              </>
            ) : (
              <EmptyState
                compact
                title="پیش‌بینی دفتر اصلی ذخیره نشده"
                action={
                  <ButtonLink href="/cashflow/forecast">
                    ساخت پیش‌بینی
                  </ButtonLink>
                }
              />
            )
          ) : c.statements.loading ? (
            <LoadingState />
          ) : c.statements.error ? (
            <ErrorState
              message={c.statements.error.message}
              onRetry={c.statements.refresh}
            />
          ) : c.statements.data?.items.length ? (
            <>
              <Select
                label="گزارش ثابت مبنا"
                value={c.local.statementId}
                onValueChange={(statementId) => c.set({ statementId })}
                options={c.statements.data.items.map((row) => ({
                  value: row.id,
                  label: `${row.snapshot.period_name || "گزارش مالی"} · ${displayDate(row.snapshot.as_of)} · ${row.id.slice(0, 8)}`,
                }))}
              />
              <CursorPagination {...c.statements} />
              <Field id="native-scenario-horizon" label="افق سناریو (روز)">
                <Input
                  id="native-scenario-horizon"
                  type="number"
                  min={1}
                  max={366}
                  value={c.local.horizonDays}
                  onChange={(event) =>
                    c.set({ horizonDays: Number(event.target.value) })
                  }
                />
              </Field>
            </>
          ) : (
            <EmptyState
              compact
              title="گزارش مالی ثابت موجود نیست"
              action={
                <ButtonLink href="/reports/native">ذخیره گزارش مالی</ButtonLink>
              }
            />
          )}
          {c.sourceHref && (
            <ButtonLink href={c.sourceHref} download variant="ghost">
              گزارش مبنا
            </ButtonLink>
          )}
          {c.baseline?.source_status === "limited" && (
            <StatusMessage tone="warning">
              زمان یا پوشش پیش‌بینی مبنا کامل نیست؛ سناریو نیز محدود است.
            </StatusMessage>
          )}
          {c.frozen.loading && <LoadingState />}
          {c.frozen.error && (
            <>
              <ErrorState
                message={c.frozen.error.message}
                onRetry={c.frozen.refresh}
              />
              <ButtonLink href="/reports/native" variant="secondary">
                بررسی ماندهٔ نقد گزارش
              </ButtonLink>
            </>
          )}
          {c.command.error && (!c.baseline || !c.canWrite) && (
            <ErrorState message={c.command.error.message} />
          )}
        </div>
      </Panel>
      {c.baseline && c.canWrite && (
        <ScenarioForm controller={c} showShifts={!!c.baseline.events.length} />
      )}
      {c.local.item && (
        <Panel title="گزارش واقعی پایان افق">
          {c.statements.error ? (
            <ErrorState
              message={c.statements.error.message}
              onRetry={c.statements.refresh}
            />
          ) : (
            <>
              <Select
                label="گزارش ثابت برای مقایسه ماندهٔ پایان"
                value={c.actualId}
                onValueChange={c.setActualId}
                options={(c.statements.data?.items || []).map((row) => ({
                  value: row.id,
                  label: `${displayDate(row.snapshot.as_of)} · ${row.id.slice(0, 8)}`,
                }))}
              />
              <CursorPagination {...c.statements} />
            </>
          )}
        </Panel>
      )}
      <ScenarioResults controller={c} native />
    </div>
  );
}
