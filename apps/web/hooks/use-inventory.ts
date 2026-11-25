"use client";
import { useState } from "react";
import { isAccountPostable } from "@/lib/account-catalogue";
import { api } from "@/lib/api";
import type { AccountingCapabilities } from "@/lib/accounting";
import type {
  InventoryCatalogue,
  InventoryDraftResult,
  InventoryItem,
  InventoryOperation,
  InventoryState,
  InventoryWarehouse,
} from "@/lib/inventory";
import { inventoryTitle } from "@/lib/inventory";
import { tehranToday } from "@/lib/native-invoices";
import { asciiDigits, persian } from "@/lib/utils";
import type { ParsedTableImport } from "@/components/ui/table";
import { toast } from "sonner";
import { useAccountOptions } from "./use-accounting";
import { useCommand } from "./use-command";
import { useNativeJournal } from "./use-native-journal";
import { usePosting } from "./use-posting";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

const base = "accounting/inventory";
const all = "all";

function useInventoryResource() {
  const workspace = useWorkspace();
  const inventory = useResource<InventoryState>(workspace.companyPath(base));
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

export function useInventoryOverview() {
  const { workspace, inventory } = useInventoryResource();
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
  const [warehouseId, setWarehouseId] = useState(all);
  const [itemId, setItemId] = useState(all);
  const [movementPage, setMovementPage] = useState(0);
  const [balancePage, setBalancePage] = useState(0);
  const journal = useNativeJournal();
  const data = inventory.data;
  const canCreate = !!data?.items.some((item) => item.active) &&
    data.warehouses.some((warehouse) => warehouse.active) && workspace.periods.length > 0 &&
    !accounts.loading && !accounts.error && accounts.options.length > 0;
  const itemNames = new Map(data?.items.map((item) => [item.id, item.name]));
  const warehouseNames = new Map(data?.warehouses.map((item) => [item.id, item.name]));
  const filter = (row: { item_id: string; warehouse_id: string }) =>
    (itemId === all || row.item_id === itemId) &&
    (warehouseId === all || row.warehouse_id === warehouseId);
  const balances = (data?.balances ?? []).filter(filter);
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
    resetFilters: () => {
      setWarehouseId(all);
      setItemId(all);
      resetPages();
    },
    balances: balances.slice(balanceIndex * pageSize, (balanceIndex + 1) * pageSize),
    movements: movements.slice(movementIndex * pageSize, (movementIndex + 1) * pageSize),
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
  const accounts = useInventoryAccounts();
  const command = useCommand();
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | InventoryWarehouse>();
  const [deleting, setDeleting] = useState<InventoryItem | InventoryWarehouse>();
  const [value, setValue] = useState({ name: "", inventory_account_id: "", active: true });
  const data = inventory.data;
  const isItem = entity === "items";
  const label = isItem ? "کالا" : "انبار";
  const canManage = data?.can_manage_catalog === true;
  const items: (InventoryItem | InventoryWarehouse)[] = data?.[entity] ?? [];
  const referenced = new Set(data?.balances.map((row) => isItem ? row.item_id : row.warehouse_id));
  const accountLocked = isItem && !!editing && referenced.has(editing.id);
  const accountNames = new Map(accounts.items.map((account) => [account.id, `${account.code} · ${account.name}`]));
  const accountOptions = accounts.options.some((option) => option.value === value.inventory_account_id) || !value.inventory_account_id
    ? accounts.options
    : [
        ...accounts.options,
        { value: value.inventory_account_id, label: accountNames.get(value.inventory_account_id) || value.inventory_account_id },
      ];
  const inventoryPath = `${base}/${entity}`;
  const pageSize = 25;
  const index = Math.min(page, Math.max(0, Math.ceil(items.length / pageSize) - 1));

  function save() {
    if (!canManage || !value.name.trim()) return;
    const body = { name: value.name.trim() };
    const catalogueData = isItem && !accountLocked && value.inventory_account_id ? { ...body, inventory_account_id: value.inventory_account_id } : body;
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
    accounts,
    accountNames,
    accountOptions,
    accountLocked,
    canManage,
    canAdd: canManage,
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
        inventory_account_id: record && "inventory_account_id" in record ? record.inventory_account_id : "",
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
    importFromExcel: async (parsed: ParsedTableImport) => {
      if (!canManage || !workspace.company || !parsed.rows.length) return;
      const headerMap: Record<string, number> = {};
      parsed.headers.forEach((h, i) => {
        headerMap[h.trim().toLowerCase()] = i;
      });

      const getCol = (names: string[]) => {
        for (const name of names) {
          for (const [h, idx] of Object.entries(headerMap)) {
            if (h.includes(name.toLowerCase())) return idx;
          }
        }
        return -1;
      };

      const nameIdx = getCol(["نام کالا", "نام انبار", "نام", "عنوان", "name"]);
      const codeIdx = getCol(["کد کالا", "کد انبار", "کد", "شناسه", "code"]);
      const accountIdx = getCol(["حساب موجودی", "حساب", "inventory_account_id"]);

      const defaultAccount = accounts.options[0]?.value;

      let successCount = 0;
      let failCount = 0;

      for (const row of parsed.rows) {
        const code = codeIdx >= 0 ? String(row[codeIdx] ?? "").trim() : "";
        const name = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : "";
        if (!code || !name) continue;

        const accId = accountIdx >= 0 && row[accountIdx] ? String(row[accountIdx]).trim() : defaultAccount;
        if (entity === "items" && !accId) {
          failCount++;
          continue;
        }

        const body =
          entity === "items"
            ? { code, name, inventory_account_id: accId }
            : { code, name };

        try {
          await api(workspace.companyPath(`${base}/${entity}`)!, {
            method: "POST",
            body,
          });
          successCount++;
        } catch {
          failCount++;
        }
      }

      inventory.refresh();
      if (successCount > 0) {
        toast.success(
          `${persian(successCount)} ${entity === "items" ? "کالا" : "انبار"} با موفقیت در سامانه تعریف شد.`,
        );
      }
      if (failCount > 0) {
        toast.warning(
          `${persian(failCount)} ردیف به دلیل تکراری بودن کد یا عدم وجود حساب موجودی ثبت نشد.`,
        );
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
  const availableItems = inventory.items.filter((item) => item.active);
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
