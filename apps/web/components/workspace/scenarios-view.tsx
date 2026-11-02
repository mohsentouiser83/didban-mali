"use client";
import { FlaskIcon } from "@phosphor-icons/react";
import { useScenarioSource } from "@/hooks/use-scenario-source";
import { NativeScenariosWorkspace } from "./native-scenarios-workspace";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import { Select } from "@/components/ui/select";
import { useCashScenarios } from "@/hooks/use-cash-scenarios";
import { NoCompany, PageHeader, Panel, PeriodFilter } from "./page-parts";
import { ScenarioForm } from "./scenario-form";
import { ScenarioResults } from "./scenario-results";
export function ImportedScenariosWorkspace() {
  const c = useCashScenarios();
  if (!c.view.workspace.company) return <NoCompany />;
  return (
    <>
      <PeriodFilter />
      <div className="space-y-5">
        <Panel
          title="سناریوهای ذخیره‌شده"
          action={
            <Button variant="secondary" onClick={() => c.load(null)}>
              سناریوی تازه
            </Button>
          }
        >
          {c.list.loading ? (
            <LoadingState />
          ) : c.list.error ? (
            <ErrorState
              message={c.list.error.message}
              onRetry={c.list.refresh}
            />
          ) : c.list.data?.items.length ? (
            <>
              <Select
                label="انتخاب نسخه سناریو"
                value={c.local.item?.id || ""}
                options={c.list.data.items.map((item) => ({
                  value: item.id,
                  label: `${item.name} · نسخه ${item.version.toLocaleString("fa-IR")}`,
                }))}
                onValueChange={(id) =>
                  c.load(
                    c.list.data!.items.find((item) => item.id === id) || null,
                  )
                }
              />
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" onClick={c.first}>
                  آخرین نسخه‌ها
                </Button>
                {c.list.data.next_cursor && (
                  <Button variant="secondary" onClick={c.next}>
                    نسخه‌های قدیمی‌تر
                  </Button>
                )}
              </div>
            </>
          ) : (
            <EmptyState compact title="سناریویی ذخیره نشده" />
          )}
        </Panel>
        {c.baseline ? (
          <>
            <Panel title="مبنای ثابت سناریو">
              <StatusMessage>
                سناریو فرضی است و سند یا تعهد مالی ایجاد نمی‌کند.
              </StatusMessage>
              {c.assumptions.length > 0 && (
                <ul className="mt-3 space-y-2 text-sm text-muted">
                  {c.assumptions.map((text, index) => (
                    <li key={index}>{text}</li>
                  ))}
                </ul>
              )}
            </Panel>
            {c.canWrite && <ScenarioForm controller={c} />}
          </>
        ) : c.view.loading || c.baselineLoading ? (
          <LoadingState />
        ) : c.view.error || c.baselineError ? (
          <ErrorState
            message={(c.view.error || c.baselineError)!.message}
            onRetry={() => {
              c.view.refresh();
              c.refreshBaseline();
            }}
          />
        ) : (
          <EmptyState
            title="پیش‌بینی معتبر برای سناریو موجود نیست"
            action={
              <ButtonLink href="/cashflow/forecast">بررسی پیش‌بینی</ButtonLink>
            }
          />
        )}
        <ScenarioResults controller={c} />
      </div>
    </>
  );
}

export function ScenariosView() {
  const { workspace: w, setup, scope, basis, select } = useScenarioSource();
  if (!w.company) return <NoCompany />;
  return (
    <>
      <PageHeader
        icon={FlaskIcon}
        title="سناریوهای نقدینگی"
        action={
          <ButtonLink href="/cashflow/forecast" variant="secondary">
            پیش‌بینی ۳۰روزه
          </ButtonLink>
        }
      />
      <div className="mb-5">
        <Select
          label="مبنای سناریو"
          value={basis}
          onValueChange={select}
          options={[
            { value: "native_statement", label: "دفتر اصلی دیدبان" },
            { value: "imported_manifest", label: "پیش‌بینی منابع واردشده" },
          ]}
        />
      </div>
      {setup.loading ? (
        <LoadingState />
      ) : setup.error ? (
        <ErrorState message={setup.error.message} onRetry={setup.refresh} />
      ) : basis === "native_statement" ? (
        <NativeScenariosWorkspace key={scope} />
      ) : (
        <ImportedScenariosWorkspace key={scope} />
      )}
    </>
  );
}
