"use client";
import { useState } from "react";
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
import { asciiDigits } from "@/lib/utils";
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
    options: accounts.items.filter((account) => account.active).map((account) => ({
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
  const [value, setValue] = useState({ code: "", name: "", inventory_account_id: "" });
  const data = inventory.data;
  const items: (InventoryItem | InventoryWarehouse)[] = data?.[entity] ?? [];
  const pageSize = 25;
  const index = Math.min(page, Math.max(0, Math.ceil(items.length / pageSize) - 1));
  function save() {
    if (!data?.can_manage_catalog || !value.code.trim() || !value.name.trim()) return;
    if (entity === "items" && !value.inventory_account_id) return;
    const body = { code: value.code.trim(), name: value.name.trim() };
    void command.run(
      workspace.companyPath(`${base}/${entity}`),
      { body: entity === "items" ? { ...body, inventory_account_id: value.inventory_account_id } : body },
      () => {
        setOpen(false);
        inventory.refresh();
      },
      entity === "items" ? "کالا تعریف شد." : "انبار تعریف شد.",
    );
  }
  return {
    inventory,
    accounts,
    command,
    open,
    value,
    rows: items.slice(index * pageSize, (index + 1) * pageSize),
    pagination: {
      page: index,
      total: items.length,
      pageSize,
      onPrevious: () => setPage(index - 1),
      onNext: () => setPage(index + 1),
    },
    show: () => {
      setValue({ code: "", name: "", inventory_account_id: "" });
      command.clearError();
      setOpen(true);
    },
    close: () => {
      if (!command.busy) setOpen(false);
    },
    change: (patch: Partial<typeof value>) => {
      setValue((previous) => ({ ...previous, ...patch }));
      command.clearError();
    },
    save,
  };
}

export function useInventoryDraft(
  kind: InventoryOperation,
  inventory: InventoryState,
  onCreated: (result: InventoryDraftResult, kind: InventoryOperation, reference: string) => void,
) {
  const workspace = useWorkspace();
  const command = useCommand();
  const [value, setValue] = useState(() => ({
    kind,
    period_id: workspace.periodId || workspace.periods.find((period) => {
      const today = tehranToday();
      return period.start <= today && period.end >= today;
    })?.id || "",
    date: tehranToday(),
    item_id: inventory.items.length === 1 ? inventory.items[0].id : "",
    warehouse_id: inventory.warehouses.length === 1 ? inventory.warehouses[0].id : "",
    quantity: "",
    unit_price: "",
    unit: workspace.unit,
    party_id: "",
    description: "",
    source_reference: "",
    counterparty_account_id: "",
    revenue_account_id: "",
    cost_account_id: "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const sale = kind === "sale_goods";
  const fields = { ...command.error?.fields, ...errors };

  function save() {
    if (!inventory.can_prepare || !(sale ? inventory.sale_enabled : inventory.purchase_enabled)) return;
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
    const reference = value.source_reference.trim();
    void command.run<InventoryDraftResult>(
      workspace.companyPath(`${base}/drafts`),
      {
        body: {
          ...common,
          ...(sale ? { revenue_account_id, cost_account_id } : {}),
          quantity,
          party_id: value.party_id.trim(),
          source_reference: reference,
          description: value.description.trim() || `${inventoryTitle[kind]} · ${reference}`,
        },
      },
      (result) => onCreated(result, kind, reference),
      "پیش‌نویس ساخته شد.",
    );
  }
  return {
    value,
    fields,
    sale,
    command,
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
