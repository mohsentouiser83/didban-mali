import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useOperationDrafts } from "./use-operation-drafts";
import { useAccountOptions } from "./use-accounting";

const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("./workspace", () => ({
  useWorkspace: () => ({
    company: { id: "current" }, periodId: "header-period",
    companyPath: (path: string) => `/companies/current/${path}`,
  }),
}));
vi.mock("./use-resource", () => ({
  useResource: () => ({
    data: { items: [
      { kind: "receipt", label: "دریافت", roles: [], amounts: ["amount"], cheque_event_required: false },
      { kind: "transfer", label: "انتقال", roles: [], amounts: ["amount", "fee"], cheque_event_required: false },
    ] },
  }),
}));
vi.mock("./use-accounting", () => ({ useAccountOptions: vi.fn(() => ({ items: [] })) }));
vi.mock("./use-paged-resource", () => ({ usePagedResource: () => ({ data: { items: [] } }) }));
vi.mock("./use-command", () => ({ useCommand: () => ({ run: mocks.run, clearError: vi.fn() }) }));
beforeEach(() => mocks.run.mockReset());

it("builds the selected journal type with its matching amounts and current period", () => {
  const onCreated = vi.fn();
  const { result } = renderHook(() => useOperationDrafts(onCreated, "transfer"));
  expect(result.current.template?.kind).toBe("transfer");
  act(() => result.current.change({ amounts: { amount: "10000", fee: "500" }, description: " انتقال " }));
  act(() => result.current.save());
  expect(mocks.run).toHaveBeenCalledWith(
    "/companies/current/accounting/operations",
    { body: expect.objectContaining({
      kind: "transfer", period_id: "header-period", description: "انتقال",
      amounts: { amount: "10000", fee: "500" },
    }) },
    expect.any(Function), expect.any(String),
  );
  expect(onCreated).not.toHaveBeenCalled();
  act(() => mocks.run.mock.calls[0][2]({ draft: { id: "new-draft" } }));
  expect(onCreated).toHaveBeenCalledOnce();
});

it("starts a different type without carrying amounts or accounts from the previous form", () => {
  const { result, unmount } = renderHook(() => useOperationDrafts(undefined, "transfer"));
  act(() => result.current.change({ amounts: { amount: "10000", fee: "500" }, accounts: { bank: "old-bank" } }));
  unmount();
  const next = renderHook(() => useOperationDrafts(undefined, "receipt"));
  expect(next.result.current.template?.kind).toBe("receipt");
  expect(next.result.current.form.amounts).toEqual({});
  expect(next.result.current.form.accounts).toEqual({});
});

it("separates treasury accounts from general accounts and excludes group or parent accounts", () => {
  vi.mocked(useAccountOptions).mockReturnValueOnce({
    items: [
      { id: "acc-grp", code: "11", name: "گروه نقد", active: true, level: "group", has_children: true, postable: false, nature: "debit", version: 1 },
      { id: "acc-par", code: "1101", name: "کل بانک", active: true, level: "general", has_children: true, postable: false, nature: "debit", version: 1 },
      { id: "acc-1", code: "110101", name: "بانک سامان", active: true, role: "bank", level: "subsidiary", has_children: false, postable: true, nature: "debit", version: 1 },
      { id: "acc-2", code: "110102", name: "صندوق دفتر", active: true, role: "cash", level: "subsidiary", has_children: false, postable: true, nature: "debit", version: 1 },
      { id: "acc-3", code: "110103", name: "تنخواه گردان", active: true, role: "petty_cash", level: "subsidiary", has_children: false, postable: true, nature: "debit", version: 1 },
      { id: "acc-4", code: "120101", name: "حساب‌های دریافتنی", active: true, role: "trade_receivable", level: "subsidiary", has_children: false, postable: true, nature: "debit", version: 1 },
      { id: "acc-5", code: "110104", name: "بانک بدون نقش اما با نام بانک", active: true, level: "subsidiary", has_children: false, postable: true, nature: "debit", version: 1 },
      { id: "acc-6", code: "510101", name: "هزینه توزیع", active: true, level: "subsidiary", has_children: false, postable: true, nature: "debit", version: 1 },
    ],
    loading: false,
    error: undefined,
    refresh: vi.fn(),
  });
  const { result } = renderHook(() => useOperationDrafts());
  expect(result.current.accountOptions).toHaveLength(6);
  expect(result.current.treasuryAccountOptions).toHaveLength(4);
  expect(result.current.treasuryAccountOptions.map((o) => o.value)).toEqual([
    "acc-1",
    "acc-2",
    "acc-3",
    "acc-5",
  ]);
  expect(result.current.treasuryAccountOptions[0].label).toContain("بانک سامان");
  expect(result.current.treasuryAccountOptions[0].label).toContain("(بانک)");
});
