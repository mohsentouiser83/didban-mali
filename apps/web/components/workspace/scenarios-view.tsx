"use client";
import { useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { ScenarioList } from "./scenario-list";
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
  const [mode, setMode] = useState<"edit" | "details" | null>(null);
  if (!c.view.workspace.company) return <NoCompany />;
  return (
    <>
      <PeriodFilter />
      <ScenarioList
        title="سناریوهای ذخیره‌شده"
        list={c.list}
        busy={c.command.busy}
        onAdd={
          c.canWrite
            ? () => {
                c.load(null);
                setMode("edit");
              }
            : undefined
        }
        onOpen={(item) => {
          c.load(item);
          setMode("details");
        }}
      />
      <Drawer
        title={c.local.item?.name || "سناریوی جدید"}
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open && !c.command.busy) setMode(null);
        }}
        className="sm:max-w-4xl"
      >
        <div className="space-y-5">
          {c.baseline && (
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
          )}
          {mode === "details" ? (
            <>
              {c.canWrite && (
                <Button variant="secondary" onClick={() => setMode("edit")}>
                  ویرایش فرض‌ها
                </Button>
              )}
              <ScenarioResults controller={c} />
            </>
          ) : (
            <>
              {c.baseline ? (
                <>
                  {c.canWrite && (
                    <ScenarioForm
                      controller={c}
                      onSaved={() => setMode("details")}
                    />
                  )}
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
                    <ButtonLink href="/cashflow/forecast">
                      بررسی پیش‌بینی
                    </ButtonLink>
                  }
                />
              )}
            </>
          )}
        </div>
      </Drawer>
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
