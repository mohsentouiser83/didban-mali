"use client";
import { useState } from "react";
import { useFinancialView } from "./use-financial-view";
import { useResource } from "./use-resource";
import { usePagedResource } from "./use-paged-resource";
import { useCommand } from "./use-command";
import { useAccountOptions } from "./use-accounting";
import type {
  AutomationRule,
  AutomationRun,
  RuleCondition,
  RuleDefinition,
  RulePreview,
  RuleScope,
} from "@/lib/automation";
import {
  actionLabels,
  operatorLabels,
  ruleFieldLabels,
} from "@/lib/automation";
const blankDefinition = (): RuleDefinition => ({
  scope: "metric",
  metric_key: "cash",
  conditions: [{ field: "value", op: "gt", value: "0" }],
  action: "notify",
});
const templateRoles = {
  sale_service: [
    { key: "trade_receivable", label: "مطالبات تجاری" },
    { key: "service_revenue", label: "درآمد خدمات" },
  ],
  purchase_service: [
    { key: "service_expense", label: "هزینه خدمات" },
    { key: "trade_payable", label: "بدهی تجاری" },
  ],
};
function operatorsFor(field: string) {
  const comparable = [
    "value",
    "remaining",
    "amount",
    "date",
    "due_date",
  ].includes(field);
  return Object.entries(operatorLabels)
    .filter(([op]) =>
      comparable
        ? op !== "contains"
        : ["account_id", "status"].includes(field)
          ? op === "eq"
          : ["eq", "contains"].includes(op),
    )
    .map(([value, label]) => ({ value, label }));
}
export function useAutomationRules() {
  const view = useFinancialView("invoices");
  const scope = view.workspace.company?.id || "";
  const base = view.workspace.companyPath("automation");
  const capabilities = useResource<{
    can_manage: boolean;
    can_learn: boolean;
  }>(base ? base + "/capabilities" : null);
  const rules = usePagedResource<AutomationRule>(base ? base + "/rules" : null);
  const accounts = useAccountOptions(scope);
  const [state, setState] = useState<{
    scope: string;
    item: AutomationRule | null;
    name: string;
    enabled: boolean;
    definition: RuleDefinition;
  }>({
    scope: "",
    item: null,
    name: "",
    enabled: false,
    definition: blankDefinition(),
  });
  const local =
    state.scope === scope
      ? state
      : {
          scope,
          item: null,
          name: "",
          enabled: false,
          definition: blankDefinition(),
        };
  const runs = usePagedResource<AutomationRun>(
    base
      ? base +
          (local.definition.scope === "native_journal"
            ? "/native-runs"
            : "/runs")
      : null,
  );
  const [previewState, setPreview] = useState<{
    key: string;
    result: RulePreview;
  } | null>(null);
  const fingerprint = JSON.stringify([
    scope,
    local.definition.scope === "native_journal" ? null : view.manifest?.id,
    local.definition,
  ]);
  const preview =
    previewState?.key === fingerprint ? previewState.result : null;
  const [previewPageState, setPreviewPage] = useState({ key: "", page: 0 });
  const previewPage =
    previewPageState.key === fingerprint ? previewPageState.page : 0;
  const command = useCommand();
  const set = (patch: Partial<typeof local>) =>
    setState({ ...local, ...patch, scope });
  const setDefinition = (patch: Partial<RuleDefinition>) => {
    const definition = { ...local.definition, ...patch };
    if (definition.action !== "prepare_draft") {
      definition.draft_template = null;
    } else if (!definition.draft_template) {
      definition.draft_template = {
        kind: "sale_service",
        accounts: { trade_receivable: "", service_revenue: "" },
      };
    }
    set({ definition });
  };
  const load = (item: AutomationRule | null) => {
    command.clearError();
    setPreview(null);
    setState({
      scope,
      item,
      name: item?.name || "",
      enabled: item?.enabled || false,
      definition: item?.definition || blankDefinition(),
    });
  };
  const changeScope = (value: RuleScope) =>
    setDefinition({
      scope: value,
      metric_key: value === "metric" ? "cash" : "",
      period_id:
        value === "native_journal"
          ? view.workspace.periodId || view.workspace.periods?.[0]?.id || ""
          : "",
      conditions: [
        {
          field:
            value === "metric"
              ? "value"
              : value === "native_journal"
                ? "amount"
                : "remaining",
          op: "gt",
          value: "0",
        },
      ],
      action:
        (["followup", "prepare_draft"].includes(local.definition.action) &&
          value === "metric") ||
        (value === "native_journal" &&
          local.definition.action === "prepare_draft")
          ? "notify"
          : local.definition.action,
    });
  const changeCondition = (index: number, patch: Partial<RuleCondition>) => {
    const conditions = local.definition.conditions.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...patch };
      if (patch.field) {
        const numeric = ["value", "remaining", "amount"].includes(patch.field);
        next.op = numeric ? "gt" : "eq";
        next.value = numeric
          ? "0"
          : patch.field === "overdue"
            ? "true"
            : patch.field === "status"
              ? local.definition.scope === "native_journal"
                ? "posted"
                : "available"
              : "";
      }
      return next;
    });
    setDefinition({ conditions });
  };
  const canPreview =
    local.definition.conditions.every((row) => !!row.value.trim()) &&
    (local.definition.scope === "native_journal"
      ? !!local.definition.period_id
      : !!view.manifest);
  const previewNow = () =>
    canPreview &&
    command.run<RulePreview>(
      base
        ? base +
            (local.definition.scope === "native_journal"
              ? "/native-preview"
              : "/preview")
        : null,
      {
        body: {
          ...(local.definition.scope === "native_journal"
            ? {}
            : { manifest_id: view.manifest!.id }),
          definition: local.definition,
        },
      },
      (result) => setPreview({ key: fingerprint, result }),
    );
  const save = () =>
    command.run<AutomationRule>(
      base ? base + "/rules" + (local.item ? `/${local.item.id}` : "") : null,
      {
        method: local.item ? "PATCH" : "POST",
        version: local.item?.version,
        body: {
          name: local.name.trim(),
          enabled: local.enabled,
          definition: local.definition,
          ...(preview?.preview_id ? { preview_id: preview.preview_id } : {}),
        },
      },
      (result) => {
        load(result);
        rules.refresh();
      },
      "قاعده ذخیره شد.",
    );
  const execute = (item: AutomationRule) =>
    command.run(
      base ? base + `/rules/${item.id}/execute` : null,
      { version: item.version, body: {} },
      () => runs.refresh(),
      "اجرای قاعده بررسی شد.",
    );
  return {
    previewPage,
    previewRows:
      preview?.matches.slice(previewPage * 25, (previewPage + 1) * 25) || [],
    nextPreviewPage: () =>
      setPreviewPage({ key: fingerprint, page: previewPage + 1 }),
    previousPreviewPage: () =>
      setPreviewPage({ key: fingerprint, page: Math.max(0, previewPage - 1) }),
    conditionRows: local.definition.conditions.map((row, index) => ({
      ...row,
      number: String(index + 1).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]),
      numeric: ["value", "remaining", "amount"].includes(row.field),
      date: ["date", "due_date"].includes(row.field),
      account: row.field === "account_id",
      status: row.field === "status",
      operators: operatorsFor(row.field),
    })),
    actionOptions: Object.entries(actionLabels)
      .filter(([key]) =>
        local.definition.scope === "metric"
          ? !["followup", "prepare_draft"].includes(key)
          : local.definition.scope === "native_journal"
            ? key !== "prepare_draft"
            : true,
      )
      .map(([value, label]) => ({
        value,
        label:
          value === "followup" && local.definition.scope === "native_journal"
            ? "پیگیری سند"
            : label,
      })),
    view,
    capabilities,
    rules,
    runs,
    local,
    preview,
    command,
    accounts,
    templateRoles: local.definition.draft_template
      ? templateRoles[local.definition.draft_template.kind]
      : [],
    accountOptions: accounts.items
      .filter((item) => item.active)
      .map((item) => ({
        value: item.id,
        label: `${item.code} · ${item.name}`,
      })),
    changeTemplate: (kind: "sale_service" | "purchase_service") =>
      setDefinition({
        draft_template: {
          kind,
          accounts: Object.fromEntries(
            templateRoles[kind].map((role) => [role.key, ""]),
          ),
        },
      }),
    changeTemplateAccount: (role: string, id: string) =>
      local.definition.draft_template &&
      setDefinition({
        draft_template: {
          ...local.definition.draft_template,
          accounts: { ...local.definition.draft_template.accounts, [role]: id },
        },
      }),
    set,
    setDefinition,
    load,
    changeScope,
    changeCondition,
    previewNow,
    save,
    execute,
    canPreview,
    nativeScope: local.definition.scope === "native_journal",
    periodOptions: (view.workspace.periods || []).map((period) => ({
      value: period.id,
      label: period.name,
    })),
    statusOptions:
      local.definition.scope === "native_journal"
        ? [
            { value: "posted", label: "ثبت‌شده" },
            { value: "reversed", label: "اصل برگشت‌شده" },
            { value: "reversal", label: "سند برگشت" },
          ]
        : [
            { value: "available", label: "مانده معتبر" },
            { value: "limited", label: "پوشش محدود" },
            { value: "unavailable", label: "مانده ناموجود" },
          ],
    canEnable: !!preview && preview.status !== "unavailable",
    metricOptions: (view.manifest?.metrics || []).map((item) => ({
      value: item.metric_key,
      label: item.label || item.metric_key,
    })),
    fieldOptions: Object.entries(ruleFieldLabels)
      .filter(([field]) =>
        local.definition.scope === "metric"
          ? field === "value"
          : local.definition.scope === "native_journal"
            ? [
                "amount",
                "party_id",
                "reference",
                "date",
                "status",
                "account_id",
              ].includes(field)
            : !["value", "account_id"].includes(field),
      )
      .map(([value, label]) => ({
        value,
        label:
          local.definition.scope === "native_journal"
            ? (
                {
                  amount: "مبلغ ردیف سند",
                  date: "تاریخ سند",
                  reference: "مرجع عملیات",
                  status: "وضعیت سند",
                } as Record<string, string>
              )[value] || label
            : label,
      })),
    operators: operatorsFor,
    addCondition: () =>
      setDefinition({
        conditions: [
          ...local.definition.conditions,
          {
            field:
              local.definition.scope === "metric"
                ? "value"
                : local.definition.scope === "native_journal"
                  ? "amount"
                  : "remaining",
            op: "gt",
            value: "0",
          },
        ],
      }),
    removeCondition: (index: number) =>
      setDefinition({
        conditions: local.definition.conditions.filter((_, i) => i !== index),
      }),
  };
}
export type AutomationController = ReturnType<typeof useAutomationRules>;
