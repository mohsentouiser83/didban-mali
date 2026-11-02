"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { usePagedResource } from "./use-paged-resource";
import { useCommand } from "./use-command";
import { useAccountOptions } from "./use-accounting";
import { useOperationLearning } from "./use-operation-learning";
interface Template {
  kind: string;
  label: string;
  roles: { key: string; label: string }[];
  amounts: string[];
  cheque_event_required: boolean;
}
export const operationAmountLabels: Record<string, string> = {
  amount: "مبلغ",
  fee: "کارمزد",
  gross: "ناخالص حقوق",
  employee_insurance: "بیمه سهم کارمند",
  employer_insurance: "بیمه سهم کارفرما",
  payroll_tax: "مالیات حقوق",
  other_deductions: "سایر کسورات",
  net_pay: "خالص حقوق",
};
export function useOperationDrafts() {
  const workspace = useWorkspace();
  const catalogue = useResource<{ items: Template[] }>(
    workspace.companyPath("accounting/operations/catalogue"),
  );
  const accounts = useAccountOptions(workspace.company?.id || "");
  const command = useCommand();
  const [created, setCreated] = useState<string>();
  const [form, setForm] = useState({
    kind: "sale_service",
    period_id: workspace.periodId || workspace.periods[0]?.id || "",
    date: "",
    description: "",
    source_reference: "",
    unit: "IRR",
    party_id: "",
    accounts: {} as Record<string, string>,
    amounts: {} as Record<string, string>,
    cheque_event_id: "",
    endorsee_party_id: "",
  });
  const template = catalogue.data?.items.find(
    (item) => item.kind === form.kind,
  );
  const chequeEvents = usePagedResource<{
    id: string;
    number: string;
    party_id: string;
    amount: string;
    date: string;
    period_id: string;
    endorsee_party_id?: string;
  }>(
    template?.cheque_event_required
      ? workspace.companyPath(
          `accounting/operations/cheque-options?kind=${form.kind}`,
        )
      : null,
  );
  function change(patch: Partial<typeof form>) {
    setForm((old) => ({ ...old, ...patch }));
    command.clearError();
    setCreated(undefined);
  }
  function choose(kind: string) {
    change({ kind, accounts: {}, amounts: {}, cheque_event_id: "" });
  }
  function save() {
    if (!template) return;
    void command.run<{ draft: { id: string } }>(
      workspace.companyPath("accounting/operations"),
      {
        body: {
          ...form,
          description: form.description.trim(),
          source_reference: form.source_reference.trim(),
          party_id: form.party_id.trim(),
          amounts: Object.fromEntries(
            template.amounts.map((key) => [key, form.amounts[key] || "0"]),
          ),
          cheque_event_id: form.cheque_event_id || null,
          endorsee_party_id:
            form.kind === "cheque_endorsed"
              ? form.endorsee_party_id || null
              : null,
        },
      },
      (result) => setCreated(result.draft.id),
      "پیش‌نویس عملیات ساخته شد.",
    );
  }
  const learning = useOperationLearning(workspace, form, template?.roles || [],
    (accounts) => change({ accounts }));
  return {
    workspace,
    catalogue,
    accounts,
    command,
    form,
    template,
    created,
    change,
    choose,
    save,
    chequeEvents,
    learning,
    selectEvent: (id: string) => {
      const event = chequeEvents.data?.items.find((item) => item.id === id);
      if (event)
        change({
          cheque_event_id: id,
          date: event.date,
          period_id: event.period_id,
          party_id: event.party_id,
          unit: "IRR",
          amounts: { amount: event.amount },
          source_reference: `چک ${event.number}`,
          endorsee_party_id: event.endorsee_party_id || "",
        });
    },
    accountOptions: accounts.items
      .filter((item) => item.active)
      .map((item) => ({
        value: item.id,
        label: `${item.code} · ${item.name}`,
      })),
  };
}
