import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { InventoryState } from "@/lib/inventory";
import { useInventoryDraft } from "./use-inventory";

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
  items: [{ id: "item", code: "A", name: "کالا", inventory_account_id: "inventory" }],
  warehouses: [{ id: "warehouse", code: "WH", name: "انبار" }],
  balances: [],
  movements: [],
  can_prepare: true,
  can_manage_catalog: true,
  purchase_enabled: true,
  sale_enabled: true,
  movements_truncated: false,
};
const draft = { operation_id: "operation", draft: { id: "draft" } };

beforeEach(() => {
  vi.mocked(api).mockReset().mockResolvedValue(draft);
});

it("creates only a purchase draft using normalized whole quantities and an exact original unit price", async () => {
  const onCreated = vi.fn();
  const { result } = renderHook(() => useInventoryDraft("purchase_goods", inventory, onCreated));
  act(() => result.current.change({
    date: "2026-01-20",
    quantity: "۳",
    unit_price: "9007199254740993",
    party_id: " supplier ",
    source_reference: " BUY-1 ",
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
        unit: "TOMAN",
        party_id: "supplier",
        source_reference: "BUY-1",
        description: "خرید کالا · BUY-1",
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
    source_reference: "SELL-1",
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
