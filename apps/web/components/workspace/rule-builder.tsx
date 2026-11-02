"use client";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input, AmountInput } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { StatusMessage } from "@/components/ui/content-states";
import type { AutomationController } from "@/hooks/use-automation-rules";
import type {
  RuleCondition,
  RuleDefinition,
  RuleScope,
} from "@/lib/automation";
import { actionLabels } from "@/lib/automation";
import { Panel } from "./page-parts";
export function RuleBuilder({
  controller: c,
}: {
  controller: AutomationController;
}) {
  return (
    <Panel title={c.local.item ? "ویرایش قاعده" : "قاعده تازه"}>
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          void c.save();
        }}
        fieldErrors={c.command.error?.fields}
      >
        <Field id="rule-name" label="نام قاعده">
          <Input
            id="rule-name"
            required
            maxLength={120}
            disabled={c.command.busy}
            value={c.local.name}
            onChange={(e) => c.set({ name: e.target.value })}
          />
        </Field>
        <fieldset disabled={c.command.busy} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="rule-scope" label="موضوع">
              <Select
                id="rule-scope"
                value={c.local.definition.scope}
                onValueChange={(value) => c.changeScope(value as RuleScope)}
                options={[
                  { value: "metric", label: "شاخص مالی" },
                  { value: "invoice", label: "فاکتور" },
                ]}
              />
            </Field>
            {c.local.definition.scope === "metric" && (
              <Field id="rule-metric" label="شاخص">
                <Select
                  id="rule-metric"
                  value={c.local.definition.metric_key}
                  onValueChange={(metric_key) =>
                    c.setDefinition({ metric_key })
                  }
                  options={c.metricOptions}
                />
              </Field>
            )}
          </div>
          <p className="font-medium">همه شرط‌های زیر برقرار باشند</p>
          {c.local.definition.conditions.map((condition, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-control border border-border p-3 sm:grid-cols-3"
            >
              <Field id={`rule-field-${index}`} label="فیلد">
                <Select
                  id={`rule-field-${index}`}
                  value={condition.field}
                  onValueChange={(field) =>
                    c.changeCondition(index, {
                      field: field as RuleCondition["field"],
                    })
                  }
                  options={c.fieldOptions}
                />
              </Field>
              <Field id={`rule-op-${index}`} label="شرط">
                <Select
                  id={`rule-op-${index}`}
                  value={condition.op}
                  onValueChange={(op) =>
                    c.changeCondition(index, { op: op as RuleCondition["op"] })
                  }
                  options={c.operators(condition.field)}
                />
              </Field>
              <Field
                id={`rule-value-${index}`}
                label={
                  ["value", "remaining", "amount"].includes(condition.field)
                    ? "مبلغ (ریال)"
                    : "مقدار"
                }
              >
                {["value", "remaining", "amount"].includes(condition.field) ? (
                  <AmountInput
                    id={`rule-value-${index}`}
                    required
                    value={condition.value}
                    onValueChange={(value) =>
                      c.changeCondition(index, { value })
                    }
                  />
                ) : condition.field === "overdue" ? (
                  <Select
                    id={`rule-value-${index}`}
                    value={condition.value}
                    onValueChange={(value) =>
                      c.changeCondition(index, { value })
                    }
                    options={[
                      { value: "true", label: "بله" },
                      { value: "false", label: "خیر" },
                    ]}
                  />
                ) : condition.field === "direction" ? (
                  <Select
                    id={`rule-value-${index}`}
                    value={condition.value}
                    onValueChange={(value) =>
                      c.changeCondition(index, { value })
                    }
                    options={[
                      { value: "sales", label: "فروش" },
                      { value: "purchases", label: "خرید" },
                    ]}
                  />
                ) : (
                  <Input
                    id={`rule-value-${index}`}
                    required
                    value={condition.value}
                    onChange={(e) =>
                      c.changeCondition(index, { value: e.target.value })
                    }
                  />
                )}
              </Field>
              {c.local.definition.conditions.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => c.removeCondition(index)}
                >
                  حذف شرط
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={c.local.definition.conditions.length >= 10}
            onClick={c.addCondition}
          >
            افزودن شرط
          </Button>
          <Field id="rule-action" label="اقدام">
            <Select
              id="rule-action"
              value={c.local.definition.action}
              onValueChange={(action) =>
                c.setDefinition({ action: action as RuleDefinition["action"] })
              }
              options={Object.entries(actionLabels)
                .filter(
                  ([value]) =>
                    c.local.definition.scope === "invoice" ||
                    value !== "followup",
                )
                .map(([value, label]) => ({ value, label }))}
            />
          </Field>
          {c.local.definition.action === "draft_request" && (
            <StatusMessage>
              این اقدام فقط درخواست تهیه پیش‌نویس می‌سازد؛ سندی ثبت نمی‌کند.
            </StatusMessage>
          )}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={!c.view.manifest || c.command.busy}
            onClick={() => void c.previewNow()}
          >
            پیش‌نمایش روی گزارش
          </Button>
          <Switch
            label="فعال‌بودن قاعده"
            checked={c.local.enabled}
            onCheckedChange={(enabled) => c.set({ enabled })}
            disabled={c.command.busy || (!c.local.enabled && !c.canEnable)}
          />
          <span>فعال</span>
          <Button
            type="submit"
            disabled={c.command.busy || (c.local.enabled && !c.canEnable)}
          >
            {c.command.busy ? "در حال بررسی…" : "ذخیره قاعده"}
          </Button>
        </div>
        {c.command.error && (
          <FormMessage error>{c.command.error.message}</FormMessage>
        )}
      </Form>
    </Panel>
  );
}
