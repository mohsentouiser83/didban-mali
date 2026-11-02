"use client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ReportBuilderController } from "@/hooks/use-report-builder";
import {
  basisOptions,
  invoiceColumns,
  metricColumns,
  sourceOptions,
  type BuilderSpec,
} from "@/lib/report-builder";
import { Panel } from "./page-parts";

export function ReportBuilderForm({
  controller: c,
}: {
  controller: ReportBuilderController;
}) {
  const { spec } = c;
  return (
    <Panel title="تعریف گزارش">
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          c.interpret();
        }}
      >
        <Field id="builder-question" label="چه گزارشی می‌خواهید؟">
          <Input
            id="builder-question"
            value={c.question}
            onChange={(event) => c.setQuestion(event.target.value)}
            placeholder="مثلاً فاکتورهای فروش سررسیدگذشته"
            maxLength={1000}
            required
          />
        </Field>
        <Button
          type="submit"
          variant="soft"
          busy={c.command.busy}
          disabled={!spec.period_id}
        >
          پیشنهاد گزارش
        </Button>
        <FormMessage>{c.message}</FormMessage>
      </Form>
      <Form
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          c.buildPreview();
        }}
      >
        <fieldset
          disabled={c.command.busy}
          className="space-y-5 disabled:opacity-70"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="builder-source" label="منبع گزارش">
              <Select
                id="builder-source"
                value={spec.source || "imported_manifest"}
                onValueChange={(value) =>
                  c.selectSource(value as BuilderSpec["source"])
                }
                options={sourceOptions}
              />
            </Field>
            <Field id="builder-period" label="دوره مالی">
              <Select
                id="builder-period"
                value={spec.period_id}
                onValueChange={(value) =>
                  c.change({ ...spec, period_id: value })
                }
                options={c.workspace.periods.map((period) => ({
                  value: period.id,
                  label: period.name,
                }))}
              />
            </Field>
            <Field id="builder-kind" label="نوع گزارش">
              <Select
                id="builder-kind"
                value={spec.kind}
                disabled={
                  spec.source === "native_statement" ||
                  spec.source === "native_invoice"
                }
                onValueChange={(value) =>
                  c.selectKind(value as BuilderSpec["kind"])
                }
                options={[
                  { value: "metrics", label: "شاخص‌های مالی" },
                  { value: "invoices", label: "فاکتورها" },
                ]}
              />
            </Field>
            <Field id="builder-basis" label="مبنای محاسبه">
              <Select
                id="builder-basis"
                value={spec.basis}
                disabled={
                  spec.kind === "invoices" || spec.source === "native_statement"
                }
                onValueChange={(value) =>
                  c.selectBasis(value as BuilderSpec["basis"])
                }
                options={basisOptions}
              />
            </Field>
          </div>
          {spec.kind === "metrics" ? (
            <fieldset>
              <legend className="font-medium">شاخص‌ها</legend>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {c.availableMetrics
                  .filter((option) => option.basis === spec.basis)
                  .map((option) => (
                    <Checkbox
                      key={option.value}
                      id={`builder-metric-${option.value}`}
                      checked={spec.metric_keys.includes(option.value)}
                      onCheckedChange={() =>
                        c.toggle("metric_keys", option.value)
                      }
                      label={option.label}
                    />
                  ))}
              </div>
              {!spec.metric_keys.length && (
                <FieldError>حداقل یک شاخص انتخاب کنید.</FieldError>
              )}
            </fieldset>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="builder-direction" label="جهت فاکتور">
                  <Select
                    id="builder-direction"
                    value={spec.filters.direction}
                    onValueChange={(value) =>
                      c.change({
                        ...spec,
                        filters: {
                          ...spec.filters,
                          direction:
                            value as BuilderSpec["filters"]["direction"],
                        },
                      })
                    }
                    options={[
                      { value: "all", label: "همه" },
                      { value: "sales", label: "فروش" },
                      { value: "purchases", label: "خرید" },
                    ]}
                  />
                </Field>
                <Field id="builder-party" label="شناسه طرف حساب">
                  <Input
                    id="builder-party"
                    value={spec.filters.party_id}
                    onChange={(event) =>
                      c.change({
                        ...spec,
                        filters: {
                          ...spec.filters,
                          party_id: event.target.value,
                        },
                      })
                    }
                    maxLength={100}
                    placeholder="همه طرف‌ها"
                  />
                </Field>
              </div>
              <Checkbox
                id="builder-overdue"
                checked={spec.filters.overdue_only}
                onCheckedChange={(value) =>
                  c.change({
                    ...spec,
                    filters: { ...spec.filters, overdue_only: value },
                  })
                }
                label="فقط سررسیدگذشته‌های مشخص"
              />
            </>
          )}
          <fieldset>
            <legend className="font-medium">ستون‌ها</legend>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {(spec.kind === "metrics" ? metricColumns : invoiceColumns).map(
                (column) => (
                  <Checkbox
                    key={column.value}
                    id={`builder-column-${column.value}`}
                    checked={spec.columns.includes(column.value)}
                    disabled={
                      !spec.columns.includes(column.value) &&
                      spec.columns.length >= 6
                    }
                    onCheckedChange={() => c.toggle("columns", column.value)}
                    label={column.label}
                  />
                ),
              )}
            </div>
            {!spec.columns.length && (
              <FieldError>حداقل یک ستون انتخاب کنید.</FieldError>
            )}
          </fieldset>
          {!spec.period_id && (
            <FieldError>دوره مالی را انتخاب کنید.</FieldError>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              busy={c.command.busy}
              disabled={
                !spec.period_id ||
                !spec.columns.length ||
                (spec.kind === "metrics" && !spec.metric_keys.length)
              }
            >
              پیش‌نمایش
            </Button>
            <Button variant="ghost" onClick={c.startNew}>
              پاک‌کردن انتخاب‌ها
            </Button>
          </div>
        </fieldset>
      </Form>
    </Panel>
  );
}
