"use client";
import { useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { ScenarioList } from "./scenario-list";
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
type Controller = ReturnType<typeof useNativeCashScenarios>;

function ScenarioBasis({ c }: { c: Controller }) {
  return (
    <Panel title="مبنای ثابت سناریو">
      <div className="space-y-4">
        <StatusMessage>
          ماندهٔ مبنا از گزارش ثابت خوانده می‌شود. دریافت‌ها و پرداخت‌های آینده فرض سناریو هستند.
        </StatusMessage>
        {!c.local.item && (
          <Field id="scenario-basis-type" label="نوع مبنای سناریو" required>
<Select
            label="نوع مبنای سناریو"
            value={c.sourceMode}
            onValueChange={c.setSourceMode}
            options={[
              { value: "manual", label: "ماندهٔ گزارش ثابت با فرض‌های دستی" },
              { value: "forecast", label: "پیش‌بینی خودکار ذخیره‌شده" },
            ]}
          />
</Field>
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
              <Field id="scenario-basis-forecast" label="پیش‌بینی ثابت مبنا" required>
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
</Field>
              <CursorPagination {...c.forecasts} />
            </>
          ) : (
            <EmptyState
              compact
              title="پیش‌بینی دفتر اصلی ذخیره نشده"
              action={<ButtonLink href="/cashflow/forecast">پیش‌بینی ۳۰روزه</ButtonLink>}
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
            <Field id="scenario-basis-statement" label="گزارش ثابت مبنا" required>
<Select
              label="گزارش ثابت مبنا"
              value={c.local.statementId}
              onValueChange={(statementId) => c.set({ statementId })}
              options={c.statements.data.items.map((row) => ({
                value: row.id,
                label: `${row.snapshot.period_name || "گزارش مالی"} · ${displayDate(row.snapshot.as_of)} · ${row.id.slice(0, 8)}`,
              }))}
            />
</Field>
            <CursorPagination {...c.statements} />
            <Field id="native-scenario-horizon" label="افق سناریو (روز)" required>
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
            action={<ButtonLink href="/reports/native">صورت‌های مالی</ButtonLink>}
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
          <ErrorState message={c.frozen.error.message} onRetry={c.frozen.refresh} />
        )}
        {c.command.error && (!c.baseline || !c.canWrite) && (
          <ErrorState message={c.command.error.message} />
        )}
      </div>
    </Panel>
  );
}

function ActualStatement({ c }: { c: Controller }) {
  return (
    <Panel title="گزارش واقعی پایان افق">
      {c.statements.error ? (
        <ErrorState
          message={c.statements.error.message}
          onRetry={c.statements.refresh}
        />
      ) : (
        <>
          <Field id="scenario-actual-statement" label="گزارش ثابت برای مقایسه ماندهٔ پایان" required>
<Select
            label="گزارش ثابت برای مقایسه ماندهٔ پایان"
            value={c.actualId}
            onValueChange={c.setActualId}
            options={(c.statements.data?.items || []).map((row) => ({
              value: row.id,
              label: `${displayDate(row.snapshot.as_of)} · ${row.id.slice(0, 8)}`,
            }))}
          />
</Field>
          <CursorPagination {...c.statements} />
        </>
      )}
    </Panel>
  );
}

export function NativeScenariosWorkspace() {
  const c = useNativeCashScenarios();
  const [mode, setMode] = useState<"edit" | "details" | null>(null);
  return (
    <>
      <ScenarioList
        title="سناریوهای دفتر اصلی"
        list={c.list}
        busy={c.command.busy}
        onAdd={
          c.canWrite
            ? () => {
                c.startNew();
                setMode("edit");
              }
            : undefined
        }
        onOpen={(item) => {
          c.startNew();
          c.select(item.id);
          setMode("details");
        }}
      />
      <Drawer
        title={
          c.local.item?.name ||
          (mode === "edit" ? "سناریوی جدید" : "جزئیات سناریو")
        }
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open && !c.command.busy) setMode(null);
        }}
        className="sm:max-w-4xl"
      >
        <div className="space-y-5">
          {mode === "edit" ? (
            <>
              <ScenarioBasis c={c} />
              {c.baseline && c.canWrite && (
                <ScenarioForm
                  controller={c}
                  showShifts={!!c.baseline.events.length}
                  onSaved={() => setMode("details")}
                />
              )}
            </>
          ) : c.local.item ? (
            <>
              {c.canWrite && (
                <Button variant="secondary" onClick={() => setMode("edit")}>
                  ویرایش فرض‌ها
                </Button>
              )}
              <ScenarioBasis c={c} />
              <ActualStatement c={c} />
              <ScenarioResults controller={c} native />
            </>
          ) : c.command.error ? (
            <ErrorState message={c.command.error.message} />
          ) : (
            <LoadingState label="در حال دریافت سناریو" />
          )}
        </div>
      </Drawer>
    </>
  );
}
