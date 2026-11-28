"use client";
import { useState } from "react";
import { isAccountPostable } from "@/lib/account-catalogue";
import { api } from "@/lib/api";
import type { AccountingCapabilities } from "@/lib/accounting";
import type {
  InventoryCatalogue,
  InventoryDraftResult,
  InventoryItem,
  InventoryItemKind,
  InventoryOperation,
  InventoryState,
  InventoryUnits,
  InventoryWarehouse,
} from "@/lib/inventory";
import { previewInventoryCatalogue, type InventoryImportRow } from "@/lib/inventory-import";
import { inventoryTitle, inventoryUnitsPath } from "@/lib/inventory";
import { tehranToday } from "@/lib/native-invoices";
import { amount, asciiDigits, persian } from "@/lib/utils";
import type { ParsedTableImport } from "@/components/ui/table";
import { toast } from "sonner";
import { useAccountOptions } from "./use-accounting";
import { useCommand } from "./use-command";
import { useNativeJournal } from "./use-native-journal";
import { usePosting } from "./use-posting";
import { useResource } from "./use-resource";
import { useTableColumnFilters } from "./use-table-column-filters";
import { useItemWarehouses } from "./use-item-warehouses";
import { useWorkspace } from "./workspace";

const base = "accounting/inventory";
const all = "all";

function useInventoryResource(asOf?: string) {
  const workspace = useWorkspace();
  const inventory = useResource<InventoryState>(workspace.companyPath(asOf ? `${base}?as_of=${asOf}` : base));
  return { workspace, inventory };
}

function useInventoryAccounts() {
  const { company } = useWorkspace();
  const accounts = useAccountOptions(company?.id || "");
  return {
    ...accounts,
    options: accounts.items.filter((account) => isAccountPostable(account)).map((account) => ({
      value: account.id,
      label: `${account.code} · ${account.name}`,
    })),
  };
}

export function useInventoryOverview(initialWarehouse = all) {
  const [asOf, setAsOf] = useState(tehranToday);
  const { workspace, inventory } = useInventoryResource(asOf);
  const accounts = useInventoryAccounts();
  const capabilities = useResource<AccountingCapabilities>(
    workspace.companyPath("accounting/capabilities"),
  );
  const [pending, setPending] = useState<{
    draftId: string;
    operationId: string;
    kind: InventoryOperation;
    reference: string;
    posted: boolean;
  }>();
  const posting = usePosting(() => {
    setPending((value) => value && { ...value, posted: true });
    inventory.refresh();
  });
  const [warehouseId, setWarehouseId] = useState(initialWarehouse);
  const [itemId, setItemId] = useState(all);
  const [movementPage, setMovementPage] = useState(0);
  const [balancePage, setBalancePage] = useState(0);
  const journal = useNativeJournal();
  const data = inventory.data;
  const canCreate = !!data?.items.some((item) => item.active && item.item_kind !== "service") &&
    data.warehouses.some((warehouse) => warehouse.active) && workspace.periods.length > 0 &&
    !accounts.loading && !accounts.error && accounts.options.length > 0;
  const itemNames = new Map(data?.items.map((item) => [item.id, item.name]));
  const itemUnits = new Map(data?.items.map((item) => [item.id, item.base_unit ?? "عدد"]));
  const warehouseNames = new Map(data?.warehouses.map((item) => [item.id, item.name]));
  const filter = (row: { item_id: string; warehouse_id: string }) =>
    (itemId === all || row.item_id === itemId) &&
    (warehouseId === all || row.warehouse_id === warehouseId);
  const balanceFilters = useTableColumnFilters((data?.balances ?? []).filter(filter), {
    quantity: (row) => `${persian(row.quantity)} ${itemUnits.get(row.item_id) ?? ""}`.trim(),
    value: (row) => amount(row.value_irr),
  });
  const balances = balanceFilters.rows;
  const movements = (data?.movements ?? []).filter(filter);
  const pageSize = 25;
  const balanceIndex = Math.min(balancePage, Math.max(0, Math.ceil(balances.length / pageSize) - 1));
  const movementIndex = Math.min(movementPage, Math.max(0, Math.ceil(movements.length / pageSize) - 1));
  function resetPages() {
    setBalancePage(0);
    setMovementPage(0);
  }

  return {
    workspace,
    inventory,
    canCreate,
    accounts,
    capabilities,
    posting,
    pending,
    journal,
    itemNames,
    itemUnits,
    asOf,
    chooseAsOf: (value: string) => { setAsOf(value || tehranToday()); resetPages(); },
    warehouseNames,
    warehouseId,
    itemId,
    all,
    chooseWarehouse: (value: string) => {
      setWarehouseId(value);
      resetPages();
    },
    chooseItem: (value: string) => {
      setItemId(value);
      resetPages();
    },
    balances: balances.slice(balanceIndex * pageSize, (balanceIndex + 1) * pageSize),
    movements: movements.slice(movementIndex * pageSize, (movementIndex + 1) * pageSize),
    balanceColumnFilter: (key: Parameters<typeof balanceFilters.bind>[0]) => balanceFilters.bind(key, () => setBalancePage(0)),
    balancePagination: {
      page: balanceIndex,
      total: balances.length,
      pageSize,
      onPrevious: () => setBalancePage(balanceIndex - 1),
      onNext: () => setBalancePage(balanceIndex + 1),
    },
    movementPagination: {
      page: movementIndex,
      total: movements.length,
      pageSize,
      onPrevious: () => setMovementPage(movementIndex - 1),
      onNext: () => setMovementPage(movementIndex + 1),
    },
    review: () => {
      if (pending && !pending.posted) void posting.review([pending.draftId]);
    },
    onDraftCreated: (result: InventoryDraftResult, kind: InventoryOperation, reference: string) => {
      setPending({ draftId: result.draft.id, operationId: result.operation_id, kind, reference, posted: false });
    },
  };
}

export function useInventoryCatalogue(entity: InventoryCatalogue) {
  const { workspace, inventory } = useInventoryResource();
  const isItem = entity === "items";
  const units = useResource<InventoryUnits>(isItem ? workspace.companyPath(inventoryUnitsPath) : null);
  const command = useCommand();
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | InventoryWarehouse>();
  const [deleting, setDeleting] = useState<InventoryItem | InventoryWarehouse>();
  const [importRows, setImportRows] = useState<InventoryImportRow[] | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [value, setValue] = useState({ name: "", base_unit: "عدد", item_kind: "goods" as InventoryItemKind, active: true });
  const data = inventory.data;
  const label = isItem ? "کالا" : "انبار";
  const itemWarehouses = useItemWarehouses(data?.warehouses ?? []);
  const canManage = data?.can_manage_catalog === true;
  const items: (InventoryItem | InventoryWarehouse)[] = data?.[entity] ?? [];
  const referenced = new Set(data?.balances.map((row) => isItem ? row.item_id : row.warehouse_id));
  const itemFieldsLocked = isItem && !!editing && referenced.has(editing.id);
  const canSave = canManage && !!value.name.trim() && (!isItem || itemFieldsLocked || !!value.base_unit.trim());
  const unitOptions = Array.from(new Set([...(units.data?.items ?? []), value.base_unit]))
    .map((unit) => ({ value: unit, label: unit }));
  const inventoryPath = `${base}/${entity}`;
  const pageSize = 25;
  const index = Math.min(page, Math.max(0, Math.ceil(items.length / pageSize) - 1));

  function save() {
    if (!canSave) return;
    const catalogueData = isItem && !itemFieldsLocked
      ? {
          name: value.name.trim(),
          base_unit: value.base_unit.trim(),
          item_kind: value.item_kind,
        }
      : { name: value.name.trim() };
    void command.run(
      workspace.companyPath(editing ? `${inventoryPath}/${editing.id}` : inventoryPath),
      editing
        ? { method: "PATCH", version: editing.version, body: { ...catalogueData, active: value.active } }
        : { body: catalogueData },
      () => {
        setOpen(false);
        inventory.refresh();
      },
      editing ? `${label} ویرایش شد.` : `${label} تعریف شد.`,
    );
  }

  function remove() {
    if (!canManage || !deleting || referenced.has(deleting.id)) return;
    void command.run(
      workspace.companyPath(`${inventoryPath}/${deleting.id}`),
      { method: "DELETE", version: deleting.version },
      () => {
        setDeleting(undefined);
        inventory.refresh();
      },
      `${label} حذف شد.`,
    );
  }

  return {
    inventory,
    units,
    itemWarehouses,
    unitOptions,
    itemFieldsLocked,
    canManage,
    canAdd: canManage && (!isItem || !!units.data),
    canSave,
    command,
    open,
    editing,
    deleting,
    remove,
    value,
    rows: items.slice(index * pageSize, (index + 1) * pageSize).map((record) => ({
      record,
      hasMovements: referenced.has(record.id),
    })),
    pagination: {
      page: index,
      total: items.length,
      pageSize,
      onPrevious: () => setPage(index - 1),
      onNext: () => setPage(index + 1),
    },
    show: (record?: InventoryItem | InventoryWarehouse) => {
      setEditing(record);
      setValue({
        name: record?.name ?? "",
        base_unit: record && "base_unit" in record && record.base_unit ? record.base_unit : "عدد",
        item_kind: record && "item_kind" in record ? record.item_kind ?? "goods" : "goods",
        active: record?.active ?? true,
      });
      command.clearError();
      setOpen(true);
    },
    confirmRemove: (record: InventoryItem | InventoryWarehouse) => {
      command.clearError();
      setDeleting(record);
    },
    cancelRemove: () => {
      if (!command.busy) setDeleting(undefined);
    },
    close: () => {
      if (!command.busy) setOpen(false);
    },
    change: (patch: Partial<typeof value>) => {
      setValue((previous) => ({ ...previous, ...patch }));
      command.clearError();
    },
    save,
    importRows,
    importBusy,
    previewImport: (file: ParsedTableImport) => {
      if (canManage && !importBusy) setImportRows(previewInventoryCatalogue(file, entity, items));
    },
    closeImport: () => { if (!importBusy) setImportRows(null); },
    confirmImport: async () => {
      const path = workspace.companyPath(inventoryPath);
      if (!canManage || !path || !importRows?.length || importBusy || importRows.some((row) => !!row.error)) return;
      setImportBusy(true);
      let saved = 0;
      try {
        for (const { body } of importRows) {
          if (!body) return;
          await api(path, { method: "POST", body });
          saved++;
        }
        setImportRows(null);
        toast.success(`${persian(saved)} ردیف ثبت شد.`);
      } catch (error) {
        const failedRow = importRows[saved]?.row ?? saved + 1;
        const message = error instanceof Error ? error.message : "ثبت انجام نشد.";
        toast.error(`${persian(saved)} ردیف ثبت شد. ردیف ${persian(failedRow)}: ${message}`);
        setImportRows(null);
      } finally {
        setImportBusy(false);
        inventory.refresh();
      }
    },
  };
}

export function useInventoryDraft(
  kind: InventoryOperation,
  inventory: InventoryState,
  onCreated: (result: InventoryDraftResult, kind: InventoryOperation, reference: string) => void,
) {
  const workspace = useWorkspace();
  const command = useCommand();
  const availableItems = inventory.items.filter((item) => item.active && item.item_kind !== "service");
  const availableWarehouses = inventory.warehouses.filter((warehouse) => warehouse.active);
  const [valueState, setValue] = useState(() => ({
    kind,
    period_id: workspace.periodId,
    date: tehranToday(),
    item_id: availableItems.length === 1 ? availableItems[0].id : "",
    warehouse_id: availableWarehouses.length === 1 ? availableWarehouses[0].id : "",
    quantity: "",
    unit_price: "",
    unit: "IRR" as const,
    party_id: "",
    description: "",
    counterparty_account_id: "",
    revenue_account_id: "",
    cost_account_id: "",
  }));
  const value = { ...valueState, period_id: workspace.periodId };
  const [errors, setErrors] = useState<Record<string, string>>({});
  const sale = kind === "sale_goods";
  const fields = { ...command.error?.fields, ...errors };

  function save() {
    if (!inventory.can_prepare) return;
    const next: Record<string, string> = {};
    const required = ["period_id", "date", "item_id", "warehouse_id", "counterparty_account_id"] as const;
    for (const field of required) {
      if (!value[field]) next[field] = "این مورد را انتخاب کنید.";
    }
    const period = workspace.periods.find((period) => period.id === value.period_id);
    if (value.date && period && (value.date < period.start || value.date > period.end))
      next.date = "تاریخ باید در محدودهٔ دورهٔ مالی باشد.";
    if (value.date > tehranToday()) next.date = "تاریخ گردش کالا نمی‌تواند در آینده باشد.";
    if (sale && !value.revenue_account_id) next.revenue_account_id = "حساب درآمد را انتخاب کنید.";
    if (sale && !value.cost_account_id) next.cost_account_id = "حساب بهای تمام‌شده را انتخاب کنید.";
    const quantity = Number(value.quantity);
    if (!/^\d+$/.test(value.quantity) || !Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000_000)
      next.quantity = "تعداد باید عدد صحیح بین ۱ و یک میلیارد باشد.";
    if (!/^\d{1,80}$/.test(value.unit_price) || !/[1-9]/.test(value.unit_price))
      next.unit_price = "قیمت واحد باید عدد صحیح مثبت باشد.";
    setErrors(next);
    if (Object.keys(next).length) {
      document.getElementById(`inventory-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    const { revenue_account_id, cost_account_id, ...common } = value;
    void command.run<InventoryDraftResult>(
      workspace.companyPath(`${base}/drafts`),
      {
        body: {
          ...common,
          ...(sale ? { revenue_account_id, cost_account_id } : {}),
          quantity,
          party_id: value.party_id.trim(),
          description: value.description.trim() || inventoryTitle[kind],
        },
      },
      (result) => onCreated(result, kind, result.source_reference ?? result.operation_id),
      "پیش‌نویس ساخته شد.",
    );
  }
  return {
    value,
    fields,
    sale,
    command,
    availableItems,
    availableWarehouses,
    periods: workspace.periods,
    save,
    change: (patch: Partial<typeof value>) => {
      setValue((previous) => ({
        ...previous,
        ...patch,
        quantity: patch.quantity === undefined ? previous.quantity : asciiDigits(patch.quantity),
      }));
      setErrors({});
      command.clearError();
    },
  };
}
