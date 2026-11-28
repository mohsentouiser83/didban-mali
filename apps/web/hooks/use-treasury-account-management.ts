"use client";

import { useState } from "react";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";
import type { AccountingCapabilities } from "@/lib/accounting";
import { moduleAllows } from "@/lib/module-access";
import type { TreasuryAccountItem, TreasuryAccountKind } from "@/lib/treasury-documents";

export function useTreasuryAccounts() {
  const workspace = useWorkspace();
  const capabilities = useResource<AccountingCapabilities>(
    workspace.companyPath("accounting/capabilities"),
  );
  const roleAllows = capabilities.data?.can_manage_accounts === true;
  const canView = moduleAllows(workspace.company, "treasury", "view", roleAllows);
  const canCreate = moduleAllows(workspace.company, "treasury", "create", roleAllows);
  const canEdit = moduleAllows(workspace.company, "treasury", "edit", roleAllows);
  const resource = useResource<{ items: TreasuryAccountItem[] }>(
    canView ? workspace.companyPath("treasury/accounts") : null,
  );
  const [toggling, setToggling] = useState<TreasuryAccountItem | null>(null);
  const toggleCommand = useCommand();

  function confirmToggleActive() {
    if (!toggling) return;
    const active = !toggling.active;
    void toggleCommand.run(
      workspace.companyPath(`treasury/accounts/${toggling.id}`),
      { method: "PATCH", version: toggling.version, body: { active } },
      () => {
        setToggling(null);
        resource.refresh();
      },
      active ? "فعال شد." : "غیرفعال شد.",
    );
  }

  return { capabilities, canView, canCreate, canEdit, resource, toggling, setToggling, toggleCommand, confirmToggleActive };
}

export function useTreasuryAccountEditor(
  editing: TreasuryAccountItem | null,
  onSaved: () => void,
) {
  const workspace = useWorkspace();
  const command = useCommand();
  const [kind, setKind] = useState<TreasuryAccountKind>(editing?.kind ?? "bank");
  const [fields, setFields] = useState({
    name: editing?.name ?? "",
    active: editing?.active ?? true,
    bank_name: editing?.bank_name ?? "",
    account_number: editing?.account_number ?? "",
    iban: editing?.iban ?? "",
    branch_name: editing?.branch_name ?? "",
    branch_code: editing?.branch_code ?? "",
    custodian_name: editing?.custodian_name ?? "",
    petty_cash_limit_irr: editing?.petty_cash_limit_irr ?? "",
    linked_bank_id: editing?.linked_bank_id ?? "",
  });

  function change<K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) {
    setFields((previous) => ({ ...previous, [key]: value }));
    command.clearError();
  }

  function save() {
    const name = fields.name.trim();
    if (!name || (kind === "pos" && !fields.linked_bank_id)) return;
    const bankFields = {
      bank_name: fields.bank_name.trim() || null,
      account_number: fields.account_number.trim() || null,
      iban: fields.iban.trim() || null,
      branch_name: fields.branch_name.trim() || null,
      branch_code: fields.branch_code.trim() || null,
    };
    const pettyFields = {
      custodian_name: fields.custodian_name.trim() || null,
      petty_cash_limit_irr: fields.petty_cash_limit_irr || null,
    };
    const specificFields = {
      bank: bankFields,
      petty_cash: pettyFields,
      cash: {},
      pos: editing?.linked_bank_id === fields.linked_bank_id
        ? {}
        : { linked_bank_id: fields.linked_bank_id },
    }[kind];
    const body = { name, active: fields.active, ...specificFields };
    const path = editing ? `treasury/accounts/${editing.id}` : "treasury/accounts";
    void command.run(
      workspace.companyPath(path),
      editing
        ? { method: "PATCH", version: editing.version, body }
        : { method: "POST", body: { kind, ...body } },
      onSaved,
      editing ? "تغییرات ذخیره شد." : "حساب خزانه ثبت شد.",
    );
  }

  return { kind, setKind, fields, change, save, command };
}
