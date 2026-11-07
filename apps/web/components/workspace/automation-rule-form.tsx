"use client";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import { amount, persian } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";

import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { AmountInput, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { StatusMessage, ErrorState } from "@/components/ui/content-states";
import {
  type RuleCondition,
  type RuleDefinition,
  type RuleScope,
} from "@/lib/automation";
import type { AutomationController } from "@/hooks/use-automation-rules";
import { Panel } from "./page-parts";
import { Drawer } from "@/components/ui/drawer";
import { RuleDraftTemplate } from "./rule-draft-template";
export function AutomationRuleForm({ c }: { c: AutomationController }) {
  return (
    <Drawer
      open={c.editorOpen}
      onOpenChange={(open) => {
        if (!open) c.closeEditor();
      }}
      className="sm:max-w-2xl"
      title={c.local.item ? "ویرایش قاعده" : "قاعده جدید"}
    >
      {!c.nativeScope && c.view.error && (
        <ErrorState message={c.view.error.message} onRetry={c.view.refresh} />
      )}
      <Form
        fieldErrors={c.command.error?.fields}
        onSubmit={(e) => {
          e.preventDefault();
          void c.save();
        }}
      >
        <Field id="rule-name" label="نام قاعده">
          <Input
            id="rule-name"
            required
            maxLength={120}
            value={c.local.name}
            onChange={(e) => c.set({ name: e.target.value })}
            disabled={c.command.busy}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="rule-scope" label="دامنه">
            <Select
              id="rule-scope"
              value={c.local.definition.scope}
              disabled={c.command.busy}
              onValueChange={(v) => c.changeScope(v as RuleScope)}
              options={[
                { value: "metric", label: "شاخص مالی" },
                { value: "invoice", label: "فاکتور" },
                { value: "native_journal", label: "سند دفتر اصلی" },
              ]}
            />
          </Field>
          {c.local.definition.scope === "metric" && (
            <Field id="rule-metric" label="شاخص">
              <Select
                id="rule-metric"
                value={c.local.definition.metric_key}
                disabled={c.command.busy}
                onValueChange={(metric_key) => c.setDefinition({ metric_key })}
                options={c.metricOptions}
              />
            </Field>
          )}
          {c.nativeScope && (
            <Field id="rule-native-period" label="دوره فعال قاعده">
              <Select
                id="rule-native-period"
                value={c.local.definition.period_id || ""}
                disabled={c.command.busy}
                onValueChange={(period_id) => c.setDefinition({ period_id })}
                options={c.periodOptions}
              />
            </Field>
          )}
        </div>
        <div className="space-y-4">
          {c.conditionRows.map((row, index) => (
            <fieldset
              key={index}
              disabled={c.command.busy}
              className="min-w-0 rounded-panel border border-border p-4"
            >
              <legend className="px-2">شرط {row.number}</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id={`rule-field-${index}`} label="اطلاعات">
                  <Select
                    id={`rule-field-${index}`}
                    value={row.field}
                    onValueChange={(field) =>
                      c.changeCondition(index, {
                        field: field as RuleCondition["field"],
                      })
                    }
                    options={c.fieldOptions}
                  />
                </Field>
                <Field id={`rule-op-${index}`} label="مقایسه">
                  <Select
                    id={`rule-op-${index}`}
                    value={row.op}
                    onValueChange={(op) =>
                      c.changeCondition(index, {
                        op: op as RuleCondition["op"],
                      })
                    }
                    options={row.operators}
                  />
                </Field>
                <Field
                  id={`rule-value-${index}`}
                  label={row.numeric ? "مبلغ (ریال)" : "مقدار"}
                >
                  {row.numeric ? (
                    <AmountInput
                      id={`rule-value-${index}`}
                      required
                      value={row.value}
                      onValueChange={(value) =>
                        c.changeCondition(index, { value })
                      }
                    />
                  ) : row.date ? (
                    <PersianDatePicker
                      id={`rule-value-${index}`}
                      value={row.value}
                      onChange={(value) => c.changeCondition(index, { value })}
                    />
                  ) : row.account ? (
                    <Select
                      id={`rule-value-${index}`}
                      value={row.value}
                      disabled={c.accounts.loading || !!c.accounts.error}
                      onValueChange={(value) =>
                        c.changeCondition(index, { value })
                      }
                      options={c.accountOptions}
                    />
                  ) : row.status ? (
                    <Select
                      id={`rule-value-${index}`}
                      value={row.value}
                      onValueChange={(value) =>
                        c.changeCondition(index, { value })
                      }
                      options={c.statusOptions}
                    />
                  ) : (
                    <Input
                      id={`rule-value-${index}`}
                      required
                      maxLength={100}
                      value={row.value}
                      onChange={(e) =>
                        c.changeCondition(index, { value: e.target.value })
                      }
                    />
                  )}
                </Field>
              </div>
              <Button
                variant="ghost"
                disabled={c.local.definition.conditions.length === 1}
                onClick={() => c.removeCondition(index)}
              >
                حذف شرط
              </Button>
            </fieldset>
          ))}
        </div>
        {c.nativeScope && c.accounts.error && (
          <ErrorState
            message={c.accounts.error.message}
            onRetry={c.accounts.refresh}
          />
        )}
        <Button
          variant="secondary"
          disabled={
            c.command.busy || c.local.definition.conditions.length >= 10
          }
          onClick={c.addCondition}
        >
          افزودن شرط
        </Button>
        <Field id="rule-action" label="اقدام">
          <Select
            id="rule-action"
            value={c.local.definition.action}
            disabled={c.command.busy}
            onValueChange={(action) =>
              c.setDefinition({ action: action as RuleDefinition["action"] })
            }
            options={c.actionOptions}
          />
        </Field>
        {c.local.definition.action === "prepare_draft" && (
          <RuleDraftTemplate c={c} />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            disabled={!c.canPreview || c.command.busy}
            onClick={() => void c.previewNow()}
          >
            پیش‌نمایش اثر
          </Button>
          <Switch
            label="فعال‌بودن قاعده"
            checked={c.local.enabled}
            disabled={c.command.busy || (!c.canEnable && !c.local.enabled)}
            onCheckedChange={(enabled) => c.set({ enabled })}
          />
          <span>فعال</span>
        </div>
        {c.local.definition.action === "draft_request" && (
          <p className="text-sm text-muted">
            درخواست تهیهٔ سند می‌سازد؛ ثبت مالی انجام نمی‌دهد.
          </p>
        )}
        <FormMessage error>{c.command.error?.message}</FormMessage>
        <Button
          type="submit"
          busy={c.command.busy}
          disabled={c.local.enabled && !c.canEnable}
        >
          ذخیره قاعده
        </Button>
      </Form>
      {c.preview && (
        <Panel title="پیش‌نمایش اثر">
          <StatusMessage tone="primary">
            {persian(c.preview.match_count)} مورد مطابق؛{" "}
            {persian(c.preview.unavailable_count)} مورد با دادهٔ ناموجود.
            پیش‌نمایش اقدامی انجام نمی‌دهد.
          </StatusMessage>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>مورد</TableHead>
                <TableHead>
                  {c.nativeScope ? "گردش ردیف‌های منطبق (ریال)" : "مبلغ (ریال)"}
                </TableHead>
                {c.local.definition.action === "prepare_draft" && (
                  <TableHead>آمادگی پیش‌نویس</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.previewRows.map((item, index) => (
                <TableRow key={`${item.subject_id}-${index}`}>
                  <TableRowHeader>{item.reference}</TableRowHeader>
                  <TableCell>{amount(item.value)}</TableCell>
                  {c.local.definition.action === "prepare_draft" && (
                    <TableCell>
                      {item.draft_eligible
                        ? "قابل تهیه؛ نیازمند تأیید سند"
                        : item.blocked_message || "نیازمند بررسی"}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={c.previewPage}
            total={c.preview.match_count}
            onNext={c.nextPreviewPage}
            onPrevious={c.previousPreviewPage}
          />
        </Panel>
      )}
    </Drawer>
  );
}
