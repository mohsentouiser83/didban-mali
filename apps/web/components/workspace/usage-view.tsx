"use client";
import { ChartBarIcon as HeaderIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { AmountInput, Input } from "@/components/ui/input";
import { useCommand } from "@/hooks/use-command";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import { type Usage } from "@/lib/api";
import { amount, persian } from "@/lib/utils";
import {
  CalendarBlankIcon,
  CurrencyCircleDollarIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function UsageView() {
  const workspace = useWorkspace();
  const resource = useResource<Usage>(workspace.companyPath("usage"));
  const command = useCommand();
  const [cap, setCap] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  if (!workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader icon={HeaderIcon} title="مصرف و هزینه" />
      {resource.loading ? (
        <LoadingState />
      ) : resource.error ? (
        <ErrorState
          message={resource.error.message}
          onRetry={resource.refresh}
        />
      ) : (
        <div className="space-y-5">
          <Panel title="مصرف مدل">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-muted">مصرف ثبت‌شده</p>
                <p className="mt-3 text-metric font-medium tabular-nums">
                  {amount(resource.data?.used)}{" "}
                  <span className="text-xs text-muted">
                    {resource.data?.currency}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-muted">بودجه رزروشده</p>
                <p className="mt-3 text-metric font-medium tabular-nums">
                  {amount(resource.data?.reserved)}{" "}
                  <span className="text-xs text-muted">
                    {resource.data?.currency}
                  </span>
                </p>
                {resource.data?.unknown_reserved != null && (
                  <p className="mt-2 text-xs text-muted">
                    از رزرو: {amount(resource.data.unknown_reserved)}{" "}
                    {resource.data.currency} در انتظار تعیین هزینه
                  </p>
                )}
              </div>
            </div>
          </Panel>
          <Panel title="سقف هزینه شرکت">
            {resource.data?.budget_mode === "unlimited" ? (
              <p className="text-sm text-muted">بودجه AI نامحدود است.</p>
            ) : resource.data?.policies.length ? (
              <div className="mb-6 divide-y divide-border">
                {resource.data.policies.map((policy) => (
                  <div
                    key={policy.id}
                    className="flex justify-between gap-4 py-3"
                  >
                    <span dir="ltr">{persian(policy.period)}</span>
                    <span>
                      {amount(policy.cap)} {resource.data?.currency}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-6 text-muted">سقف هزینه تعیین نشده است.</p>
            )}
            {workspace.user?.installation_admin && resource.data?.budget_mode !== "unlimited" && (
              <Form
                fieldErrors={command.error?.fields}
                onSubmit={(event) => {
                  event.preventDefault();
                  void command.run(
                    workspace.companyPath("budget-policy"),
                    { body: { cap, period } },
                    () => {
                      resource.refresh();
                      setCap("");
                    },
                    "سقف هزینه ذخیره شد.",
                  );
                }}
              >
                <div className="grid max-w-xl gap-4 sm:grid-cols-2">
                  <Field
                    id="budget-cap"
                    label="سقف (USD)"
                    icon={CurrencyCircleDollarIcon}
                  >
                    <AmountInput
                      id="budget-cap"
                      required
                      value={cap}
                      onValueChange={setCap}
                    />
                  </Field>
                  <Field
                    id="budget-period"
                    label="دوره هزینه (سال و ماه میلادی)"
                    icon={CalendarBlankIcon}
                  >
                    <Input
                      id="budget-period"
                      required
                      dir="ltr"
                      value={period}
                      pattern="[0-9]{4}-[0-9]{2}"
                      onChange={(event) => setPeriod(event.target.value)}
                    />
                  </Field>
                </div>
                <FormMessage error>{command.error?.message}</FormMessage>
                <Button type="submit" busy={command.busy}>
                  ذخیره سقف
                </Button>
              </Form>
            )}
          </Panel>
        </div>
      )}

    </>
  );
}
