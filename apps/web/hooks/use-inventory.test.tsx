import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { previewInventoryCatalogue } from "@/lib/inventory-import";
import type { InventoryState } from "@/lib/inventory";
import { useInventoryCatalogue, useInventoryDraft } from "./use-inventory";

vi.mock("./workspace", () => ({
  useWorkspace: () => ({
    companyPath: (path: string) => `/companies/company/${path}`,
    periodId: "period",
    periods: [{ id: "period", start: "2026-01-01", end: "2026-12-31" }],
    unit: "TOMAN",
  }),
}));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));

const inventory: InventoryState = {
  items: [{ id: "item", code: "A", name: "کالا", inventory_account_id: "inventory", active: true, version: 1 }],
  warehouses: [{ id: "warehouse", code: "WH", name: "انبار", active: true, version: 1 }],
  balances: [],
  movements: [],
  can_prepare: true,
  can_manage_catalog: true,
  purchase_enabled: true,
  sale_enabled: true,
  movements_truncated: false,
};
const draft = { source_reference: "BUY-1", operation_id: "operation", draft: { id: "draft" } };

beforeEach(() => {
  vi.mocked(api).mockReset().mockResolvedValue(draft);
});

it("imports goods and services without an account even when the spreadsheet has an old account column", () => {
  const rows = previewInventoryCatalogue({
    headers: ["نام کالا", "نوع", "واحد پایه", "حساب موجودی"],
    rows: [["پارچه", "کالا", "متر", ""], ["حمل", "خدمت", "ساعت", "101"]],
    totalRows: 2,
  }, "items", []);

  expect(rows.map((row) => row.body)).toEqual([
    { name: "پارچه", item_kind: "goods", base_unit: "متر" },
    { name: "حمل", item_kind: "service", base_unit: "ساعت" },
  ]);
});

it("creates only a purchase draft using normalized whole quantities and an exact original unit price", async () => {
  const onCreated = vi.fn();
  const { result } = renderHook(() => useInventoryDraft("purchase_goods", inventory, onCreated));
  act(() => result.current.change({
    date: "2026-01-20",
    quantity: "۳",
    unit_price: "9007199254740993",
    party_id: " supplier ",
    counterparty_account_id: "payable",
  }));
  act(() => result.current.save());
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(draft, "purchase_goods", "BUY-1"));
  expect(vi.mocked(api).mock.calls).toEqual([[
    "/companies/company/accounting/inventory/drafts",
    expect.objectContaining({
      body: {
        kind: "purchase_goods",
        period_id: "period",
        date: "2026-01-20",
        item_id: "item",
        warehouse_id: "warehouse",
        quantity: 3,
        unit_price: "9007199254740993",
        unit: "IRR",
        party_id: "supplier",
        description: "خرید کالا",
        counterparty_account_id: "payable",
      },
    }),
  ]]);
});

it("requires both posting accounts for sales and keeps the currency exact", async () => {
  const { result } = renderHook(() => useInventoryDraft("sale_goods", inventory, vi.fn()));
  act(() => result.current.change({
    date: "2026-01-20",
    quantity: "٢",
    unit_price: "2000",
    party_id: "customer",
    counterparty_account_id: "receivable",
  }));
  act(() => result.current.save());
  expect(result.current.fields).toMatchObject({
    revenue_account_id: expect.any(String),
    cost_account_id: expect.any(String),
  });
  expect(api).not.toHaveBeenCalled();

  act(() => result.current.change({ revenue_account_id: "revenue", cost_account_id: "cost" }));
  act(() => result.current.save());
  await waitFor(() => expect(api).toHaveBeenCalledOnce());
  expect(vi.mocked(api).mock.calls[0][1]?.body).toMatchObject({
    kind: "sale_goods",
    quantity: 2,
    unit_price: "2000",
    revenue_account_id: "revenue",
    cost_account_id: "cost",
  });
});

it("edits an active warehouse with its selected version and deletes the current version", async () => {
  const warehouse = inventory.warehouses[0];
  const savedWarehouse = { ...warehouse, name: "انبار بایگانی", active: false, version: 2 };
  let currentInventory = inventory;
  vi.mocked(api).mockImplementation(async (_path, options) => {
    if (options?.method === "PATCH") {
      currentInventory = { ...inventory, warehouses: [savedWarehouse] };
    } else if (options?.method === "DELETE") {
      currentInventory = { ...inventory, warehouses: [] };
    }
    return currentInventory as never;
  });
  const { result } = renderHook(() => useInventoryCatalogue("warehouses"));
  await waitFor(() => expect(result.current.rows).toHaveLength(1));

  act(() => result.current.show(warehouse));
  act(() => result.current.change({ name: savedWarehouse.name, active: false }));
  act(() => result.current.save());
  await waitFor(() => expect(result.current.rows[0]?.record).toEqual(savedWarehouse));
  expect(vi.mocked(api)).toHaveBeenCalledWith(
    "/companies/company/accounting/inventory/warehouses/warehouse",
    { method: "PATCH", version: 1, body: { name: savedWarehouse.name, active: false } },
  );

  act(() => result.current.confirmRemove(savedWarehouse));
  act(() => result.current.remove());
  await waitFor(() => expect(result.current.rows).toHaveLength(0));
  expect(vi.mocked(api)).toHaveBeenCalledWith(
    "/companies/company/accounting/inventory/warehouses/warehouse",
    { method: "DELETE", version: 2 },
  );
});
