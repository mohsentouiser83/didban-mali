"use client";
import { useRef, useState } from "react";
import type { AccountingCapabilities } from "@/lib/accounting";
import type { Counterparty, CounterpartyForm, Proforma, ProformaForm, ProformaLineForm } from "@/lib/commercial";
import type { InventoryState } from "@/lib/inventory";
import { tehranToday } from "@/lib/native-invoices";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

function useCommercialList<T extends { id: string; version: number }>(
  entity: "counterparties" | "proformas",
  search = "",
) {
  const workspace = useWorkspace();
  const base = workspace.companyPath(`commercial/${entity}`);
  const pageSize = 25;
  const [page, setPage] = useState(0);
  const query = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
  if (search) query.set("search", search);
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
      pendingRequest.current = { fingerprint, key: crypto.randomUUID() };
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
  const list = useCommercialList<Counterparty>("counterparties", search);
  const canEdit = list.capabilities.data?.can_manage_accounts === true;
  return {
    ...list, search, canEdit,
    changeSearch(value: string) {
      list.resetPage();
      setSearch(value);
    },
    save(form: CounterpartyForm) {
      if (!canEdit) return;
      list.save({
        ...form, name: form.name.trim(), code: form.code.trim(),
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
    code: row?.code ?? "", name: row?.name ?? "",
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
    number: row?.number ?? "", direction: row?.direction ?? "sale",
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
    list.editor && !list.editor.readOnly && partyQuery.trim()
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
        ...form, number: form.number.trim(), party_id: form.party_id.trim(),
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
