"use client";
import { randomId } from "@/lib/random-id";
import { useRef, useState } from "react";
import type { AccountingCapabilities } from "@/lib/accounting";
import type { Counterparty, CounterpartyForm, Proforma, ProformaForm, ProformaLineForm } from "@/lib/commercial";
import type { InventoryState } from "@/lib/inventory";
import { tehranToday } from "@/lib/native-invoices";
import { useAccountOptions } from "./use-accounting";
import { isAccountPostable, isTreasuryAccount, treasuryRoleLabel } from "@/lib/account-catalogue";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

function useCommercialList<T extends { id: string; version: number }>(
  entity: "counterparties" | "proformas",
  search = "",
  typeFilter = "",
) {
  const workspace = useWorkspace();
  const base = workspace.companyPath(`commercial/${entity}`);
  const pageSize = 25;
  const [page, setPage] = useState(0);
  const query = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
  if (search) query.set("search", search);
  if (typeFilter && typeFilter !== "all") query.set("type", typeFilter);
  const resource = useResource<{ items: T[]; total: number }>(base && `${base}?${query}`);
  const capabilities = useResource<AccountingCapabilities>(workspace.companyPath("accounting/capabilities"));
  const command = useCommand();
  const pendingRequest = useRef<{ fingerprint: string; key: string }>(null);
  const [editor, setEditor] = useState<{ row?: T; readOnly: boolean }>();

  function open(row?: T, readOnly = false) {
    command.clearError();
    pendingRequest.current = null;
    setEditor({ row, readOnly });
  }

  function close() {
    if (!command.busy) setEditor(undefined);
  }

  function save(body: unknown) {
    if (!base || !editor || editor.readOnly) return;
    const row = editor.row;
    const fingerprint = JSON.stringify([row?.id, row?.version, body]);
    if (pendingRequest.current?.fingerprint !== fingerprint) {
      pendingRequest.current = { fingerprint, key: randomId() };
    }
    void command.run<T>(row ? `${base}/${row.id}` : base, {
      method: row ? "PATCH" : "POST",
      body,
      version: row?.version,
      key: pendingRequest.current.key,
    }, () => {
      if (!row) setPage(0);
      resource.refresh();
      setEditor(undefined);
    }, "ذخیره شد");
  }

  return {
    workspace, base, resource, capabilities, command, editor, open, close, save,
    resetPage: () => setPage(0),
    pagination: {
      page, pageSize, total: resource.data?.total ?? 0,
      onPrevious: () => setPage((value) => value - 1),
      onNext: () => setPage((value) => value + 1),
    },
  };
}

export function useCounterparties() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const list = useCommercialList<Counterparty>("counterparties", search, typeFilter);
  const canEdit = list.capabilities.data?.can_manage_accounts === true;
  return {
    ...list, search, typeFilter, canEdit,
    changeSearch(value: string) {
      list.resetPage();
      setSearch(value);
    },
    changeTypeFilter(value: string) {
      list.resetPage();
      setTypeFilter(value);
    },
    save(form: CounterpartyForm) {
      if (!canEdit || !form.type) return;
      list.save({
        ...form, name: form.name.trim(),
        national_id: form.national_id.trim() || null,
        economic_code: form.economic_code.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        credit_limit_irr: form.credit_limit_irr || null,
      });
    },
  };
}

export function counterpartyForm(row?: Counterparty): CounterpartyForm {
  return {
    name: row?.name ?? "", type: row?.type ?? "",
    national_id: row?.national_id ?? "", economic_code: row?.economic_code ?? "",
    phone: row?.phone ?? "", address: row?.address ?? "",
    credit_limit_irr: row?.credit_limit_irr ?? "", active: row?.active ?? true,
  };
}

export function emptyProformaLine(key: number): ProformaLineForm {
  return { key, item_id: "", description: "", quantity: "1", unit_price: "", discount: "" };
}

export function proformaForm(row?: Proforma): ProformaForm {
  return {
    direction: "sale",
    date: row?.date ?? tehranToday(), expiry_date: row?.expiry_date ?? "",
    party_id: row?.party_id ?? "", currency: row?.currency ?? "IRR", terms: row?.terms ?? "",
    lines: row?.lines.map((line, key) => ({
      key, item_id: line.item_id ?? "", description: line.description,
      quantity: String(line.quantity), unit_price: line.unit_price, discount: line.discount,
    })) ?? [emptyProformaLine(0)],
  };
}

export function useProformas() {
  const list = useCommercialList<Proforma>("proformas");
  const inventory = useResource<InventoryState>(
    list.editor && !list.editor.readOnly ? list.workspace.companyPath("accounting/inventory") : null,
  );
  const [partyQuery, setPartyQuery] = useState("");
  const parties = useResource<{ items: Counterparty[] }>(
    list.editor && !list.editor.readOnly
      ? list.workspace.companyPath(`commercial/counterparties?active_only=true&limit=25&search=${encodeURIComponent(partyQuery.trim())}`)
      : null,
  );
  const canPrepare = list.capabilities.data?.can_prepare === true;

  return {
    ...list, canPrepare, partyQuery, setPartyQuery,
    partyError: parties.error?.message,
    partyOptions: parties.data?.items.map((party) => ({
      value: party.code, label: `${party.name} · ${party.code}`,
    })) ?? [],
    itemOptions: inventory.data?.items.map((item) => ({
      value: item.id, label: `${item.name} · ${item.code}`,
    })) ?? [],
    open(row?: Proforma, readOnly = false) {
      setPartyQuery("");
      list.open(row, readOnly);
    },
    save(form: ProformaForm) {
      if (!canPrepare) return;
      list.save({
        ...form, party_id: form.party_id.trim(),
        expiry_date: form.expiry_date || null, terms: form.terms.trim() || null,
        lines: form.lines.map((line) => ({
          item_id: line.item_id || null, description: line.description.trim(),
          quantity: Number(line.quantity), unit_price: line.unit_price,
          discount: line.discount || "0",
        })),
      });
    },
  };
}

export function useProformaConversion(row: Proforma, onComplete: () => void) {
  const operation = useWorkspace();
  const accountResource = useAccountOptions(operation.company?.id ?? "");
  const accounts = {
    ...accountResource,
    options: accountResource.items.filter((item) => isAccountPostable(item)).map(({ id, code, name }) => ({
      value: id, label: `${code} · ${name}`,
    })),
    treasuryOptions: accountResource.items
      .filter((item) => isAccountPostable(item) && isTreasuryAccount(item))
      .map(({ id, code, name, role }) => ({
        value: id,
        label: `${code} · ${name}${role ? ` (${treasuryRoleLabel(role)})` : ""}`,
      })),
  };
  const inventory = useResource<InventoryState>(operation.companyPath("accounting/inventory"));
  const command = useCommand();
  const today = tehranToday();
  const periods = operation.periods.filter((period) => period.start <= today && period.end >= today);
  const [valuesState, setValues] = useState({
    period_id: operation.periodId,
    warehouse_id: "",
    counterparty_account_id: "",
    revenue_account_id: "",
    cost_account_id: "",
    settlement_type: "on_account",
    cash_amount: "",
    cheque_amount: "",
    on_account_amount: "",
    cash_account_id: "",
    cheque_account_id: "",
    cheque_number: "",
    cheque_due_date: "",
  });
  const values = { ...valuesState, period_id: operation.periodId };
  const request = useRef<{ fingerprint: string; key: string }>(null);
  const mixed = values.settlement_type === "mixed";
  const cash = values.settlement_type === "cash" || (mixed && /[1-9]/.test(values.cash_amount));
  const cheque = mixed && /[1-9]/.test(values.cheque_amount);
  const onAccount = values.settlement_type === "on_account" || (mixed && /[1-9]/.test(values.on_account_amount));
  const valid = !!(values.period_id && values.warehouse_id && values.revenue_account_id && values.cost_account_id)
    && (!onAccount || !!values.counterparty_account_id)
    && (!cash || !!values.cash_account_id)
    && (!cheque || !!(values.cheque_account_id && values.cheque_number.trim() && values.cheque_due_date))
    && (!mixed || cash || cheque || onAccount);

  function save() {
    if (!valid) return;
    const body = {
      period_id: values.period_id,
      warehouse_id: values.warehouse_id,
      source_reference: `proforma:${row.id}`,
      settlement_type: values.settlement_type,
      revenue_account_id: values.revenue_account_id,
      cost_account_id: values.cost_account_id,
      ...(onAccount ? { counterparty_account_id: values.counterparty_account_id } : {}),
      ...(cash ? { cash_account_id: values.cash_account_id } : {}),
      ...(cheque ? { cheque_account_id: values.cheque_account_id,
        cheque_number: values.cheque_number.trim(), cheque_due_date: values.cheque_due_date } : {}),
      ...(mixed ? { cash_amount: values.cash_amount || "0", cheque_amount: values.cheque_amount || "0",
        on_account_amount: values.on_account_amount || "0" } : {}),
    };
    const fingerprint = JSON.stringify(body);
    if (request.current?.fingerprint !== fingerprint) {
      request.current = { fingerprint, key: randomId() };
    }
    void command.run(operation.companyPath(`commercial/proformas/${row.id}/convert`), {
      method: "POST",
      body,
      version: row.version,
      key: request.current.key,
    }, onComplete, "پیش‌نویس فروش ساخته شد.");
  }

  return { accounts, inventory, command, periods, values, setValues, mixed, cash, cheque, onAccount, valid, save };
}
