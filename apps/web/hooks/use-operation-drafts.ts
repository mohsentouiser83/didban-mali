"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { usePagedResource } from "./use-paged-resource";
import { useCommand } from "./use-command";
import { useAccountOptions } from "./use-accounting";
import { isAccountPostable, isTreasuryAccount, treasuryRoleLabel } from "@/lib/account-catalogue";
import type { TreasuryAccountOptionsResponse } from "@/lib/treasury-documents";
export interface OperationTemplate {
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
export function useOperationDrafts(
  onCreated?: () => void,
  initialKind = "sale_service",
) {
  const workspace = useWorkspace();
  const catalogue = useResource<{ items: OperationTemplate[] }>(
    workspace.companyPath("accounting/operations/catalogue"),
  );
  const accounts = useAccountOptions(workspace.company?.id || "");
  const command = useCommand();
  const [created, setCreated] = useState<string>();
  const [formState, setForm] = useState({
    kind: initialKind,
    period_id: workspace.periodId,
    date: "",
    description: "",
    unit: "IRR",
    party_id: "",
    accounts: {} as Record<string, string>,
    amounts: {} as Record<string, string>,
    cheque_event_id: "",
    endorsee_party_id: "",
    point_of_sale_id: "",
  });
  const form = { ...formState, period_id: workspace.periodId };
  const supportsPointOfSale = form.kind === "receipt" || form.kind === "payment";
  const terminals = useResource<TreasuryAccountOptionsResponse>(
    supportsPointOfSale ? workspace.companyPath("treasury/accounts/options?kind=pos&active_only=true") : null,
  );
  const pointOfSaleOptions = (terminals.data?.items ?? []).map((item) => ({
    value: item.id,
    label: `کارت‌خوان · ${item.name}`,
  }));
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
    change({ kind, accounts: {}, amounts: {}, cheque_event_id: "", point_of_sale_id: "" });
  }
  function selectAccount(role: string, value: string) {
    const isBankSelection = supportsPointOfSale && role === "bank_a";
    const isTerminal = isBankSelection && pointOfSaleOptions.some((item) => item.value === value);
    change({
      accounts: { ...form.accounts, [role]: isTerminal ? "" : value },
      ...(isBankSelection && { point_of_sale_id: isTerminal ? value : "" }),
    });
  }
  function save() {
    if (!template || !workspace.periodId) return;
    const { point_of_sale_id, ...details } = form;
    void command.run<{ draft: { id: string } }>(
      workspace.companyPath("accounting/operations"),
      {
        body: {
          ...details,
          ...(point_of_sale_id && { point_of_sale_id }),
          description: form.description.trim(),
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
      (result) => {
        setCreated(result.draft.id);
        onCreated?.();
      },
      "پیش‌نویس عملیات ساخته شد.",
    );
  }
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
    selectAccount,
    supportsPointOfSale,
    pointOfSaleOptions,
    save,
    chequeEvents,
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
          endorsee_party_id: event.endorsee_party_id || "",
        });
    },
    accountOptions: accounts.items
      .filter((item) => isAccountPostable(item))
      .map((item) => ({
        value: item.id,
        label: `${item.code} · ${item.name}`,
      })),
    treasuryAccountOptions: accounts.items
      .filter((item) => isAccountPostable(item) && isTreasuryAccount(item))
      .map((item) => ({
        value: item.id,
        label: `${item.code} · ${item.name}${item.role ? ` (${treasuryRoleLabel(item.role)})` : ""}`,
      })),
  };
}
