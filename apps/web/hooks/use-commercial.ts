"use client";
import { moduleAllows } from "@/lib/module-access";
import { randomId } from "@/lib/random-id";
import { useRef, useState } from "react";
import type { AccountingCapabilities } from "@/lib/accounting";
import {
  normalizeCounterpartyPayload,
  type Counterparty,
  type CounterpartyForm,
  type Proforma,
  type ProformaForm,
  type ProformaLineForm,
} from "@/lib/commercial";
import type { InventoryState } from "@/lib/inventory";
import { tehranToday } from "@/lib/native-invoices";
import { useAccountOptions } from "./use-accounting";
import { isAccountPostable, isTreasuryAccount, treasuryRoleLabel } from "@/lib/account-catalogue";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

function useCommercialList<T extends { id: string; version: number }>(
  entity: "counterparties" | "proformas",
  filters?: Record<string, string>,
) {
  const workspace = useWorkspace();
  const base = workspace.companyPath(`commercial/${entity}`);
  const pageSize = 25;
  const [page, setPage] = useState(0);
  const query = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value) query.set(key, value);
  }
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
  const [terms, setTerms] = useState({ name: "", code: "" });
  const [typeFilter, setTypeFilter] = useState("all");
  const [entityKindFilter, setEntityKindFilter] = useState("all");
  const list = useCommercialList<Counterparty>("counterparties", {
    ...terms,
    type: typeFilter === "all" ? "" : typeFilter,
    entity_kind: entityKindFilter === "all" ? "" : entityKindFilter,
  });
  const managesAccounts = list.capabilities.data?.can_manage_accounts === true;
  const canCreate = moduleAllows(list.workspace.company, "commercial", "create", managesAccounts);
  const canEdit = moduleAllows(list.workspace.company, "commercial", "edit", managesAccounts);
  const canViewReports = Boolean(list.workspace.company?.role);
  return {
    ...list, typeFilter, entityKindFilter, canCreate, canEdit, canViewReports,
    filtersActive: !!(terms.name || terms.code || typeFilter !== "all" || entityKindFilter !== "all"),
    columnFilter: (key: keyof typeof terms) => ({
      activeFilter: terms[key] ? { textCondition: terms[key] } : undefined,
      isActive: !!terms[key],
      maxLength: key === "name" ? 150 : 100,
      onApply: (filter: { textCondition?: string } | null) => {
        list.resetPage();
        setTerms((previous) => ({ ...previous, [key]: filter?.textCondition ?? "" }));
      },
    }),
    changeTypeFilter(value: string) {
      list.resetPage();
      setTypeFilter(value);
    },
    changeEntityKindFilter(value: string) {
      list.resetPage();
      setEntityKindFilter(value);
    },
    save(form: CounterpartyForm) {
      const body = normalizeCounterpartyPayload(form, list.editor?.row);
      if (!(list.editor?.row ? canEdit : canCreate) || !body.roles.length) return;
      list.save(body);
    },
  };
}

export function emptyProformaLine(key: number): ProformaLineForm {
  return { key, item_id: "", description: "", quantity: "1", unit_price: "", discount: "" };
}

export function proformaForm(row?: Proforma): ProformaForm {
  return {
    direction: "sale",
    date: row?.date ?? tehranToday(), expiry_date: row?.expiry_date ?? "",
    party_id: row?.party_id ?? "", currency: row?.currency ?? "IRR",
    invoice_discount: row?.invoice_discount ?? "0", terms: row?.terms ?? "",
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
  const canManageAccounts = list.capabilities.data?.can_manage_accounts === true;

  return {
    ...list, canPrepare, canManageAccounts, partyQuery, setPartyQuery,
    refreshParties: () => parties.refresh(),
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
        invoice_discount: form.invoice_discount || "0",
        lines: form.lines.map((line) => ({
          item_id: line.item_id || null,
          line_kind: line.item_id ? "goods" : "service",
          description: line.description.trim(),
          quantity: Number(line.quantity), unit_price: line.unit_price,
          discount: line.discount || "0",
        })),
      });
    },
    cancel(row: Proforma, reason: string, onDone?: () => void) {
      if (!canPrepare) return;
      void list.command.run(list.workspace.companyPath(`commercial/proformas/${row.id}/cancel`), {
        method: "POST",
        version: row.version,
        body: { reason: reason.trim() },
      }, () => {
        list.resource.refresh();
        onDone?.();
      }, "پیش‌فاکتور لغو شد.");
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
  const rolesResource = useResource<{ items: { account_id: string; role: string | null }[] }>(
    operation.companyPath("accounting/account-roles?limit=200"),
  );
  const command = useCommand();
  const today = tehranToday();
  const periods = operation.periods.filter((period) => period.start <= today && period.end >= today);
  const hasGoods = row.lines.some((l) => l.line_kind !== "service" && !!l.item_id);
  const hasService = row.lines.some((l) => l.line_kind === "service" || !l.item_id);
  const hasDiscount = Number(row.invoice_discount || 0) > 0 || row.lines.some((l) => Number(l.discount || 0) > 0);
  const roleItems = rolesResource.data?.items ?? [];
  const postableIds = new Set(accounts.options.map((o) => o.value));
  const suggestRole = (...roles: string[]) => {
    for (const r of roles) {
      const found = roleItems.find((item) => item.role === r && postableIds.has(item.account_id));
      if (found) return found.account_id;
    }
    return "";
  };
  const [valuesState, setValues] = useState({
    period_id: operation.periodId,
    warehouse_id: "",
    counterparty_account_id: "",
    revenue_account_id: "",
    service_revenue_account_id: "",
    discount_account_id: "",
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
  const values = {
    ...valuesState,
    period_id: operation.periodId,
    counterparty_account_id: valuesState.counterparty_account_id || suggestRole("trade_receivable"),
    revenue_account_id: valuesState.revenue_account_id || suggestRole("revenue"),
    service_revenue_account_id: valuesState.service_revenue_account_id || suggestRole("revenue"),
    cost_account_id: valuesState.cost_account_id || suggestRole("expense"),
    cash_account_id: valuesState.cash_account_id || suggestRole("cash_bank", "bank", "cash"),
    cheque_account_id: valuesState.cheque_account_id || suggestRole("notes_receivable"),
  };
  const request = useRef<{ fingerprint: string; key: string }>(null);
  const mixed = values.settlement_type === "mixed";
  const cash = values.settlement_type === "cash" || (mixed && /[1-9]/.test(values.cash_amount));
  const cheque = mixed && /[1-9]/.test(values.cheque_amount);
  const onAccount = values.settlement_type === "on_account" || (mixed && /[1-9]/.test(values.on_account_amount));
  const mixedSumMatch = !mixed || (
    BigInt(values.cash_amount || "0") + BigInt(values.cheque_amount || "0") + BigInt(values.on_account_amount || "0") ===
    BigInt(row.total_amount || "0")
  );
  const valid = !!values.period_id
    && (!hasGoods || !!(values.warehouse_id && values.revenue_account_id && values.cost_account_id))
    && (!hasService || !!values.service_revenue_account_id)
    && (!onAccount || !!values.counterparty_account_id)
    && (!cash || !!values.cash_account_id)
    && (!cheque || !!(values.cheque_account_id && values.cheque_number.trim() && values.cheque_due_date))
    && (!mixed || ((cash || cheque || onAccount) && mixedSumMatch));

  function save() {
    if (!valid) return;
    const body = {
      period_id: values.period_id,
      ...(hasGoods ? { warehouse_id: values.warehouse_id, revenue_account_id: values.revenue_account_id, cost_account_id: values.cost_account_id } : {}),
      ...(hasService ? { service_revenue_account_id: values.service_revenue_account_id } : {}),
      ...(hasDiscount && values.discount_account_id ? { discount_account_id: values.discount_account_id } : {}),
      source_reference: `proforma:${row.id}`,
      settlement_type: values.settlement_type,
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

  return { accounts, inventory, command, periods, values, setValues, hasGoods, hasService, hasDiscount, mixed, mixedSumMatch, cash, cheque, onAccount, valid, save };
}
