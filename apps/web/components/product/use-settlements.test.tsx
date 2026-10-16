import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/product-api";
import { settlementMoney } from "@/lib/settlements";
import { useSettlements } from "./use-settlements";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
const invoice = { source_row_id: "invoice", key: "key", direction: "sales" as const, number: "test", party_name: "مشتری", issue_date: "2025-01-01", gross_amount_irr: "100", allocated_amount_irr: "0", unallocated_amount_irr: "100", review_reason: null };
const bank = { id: "bank", booking_date: "2025-01-02", description: "وصول", bank_label: "بانک", amount_irr: "150", available_amount_irr: "150", reason: "انتخاب دستی" };
beforeEach(() => vi.resetAllMocks());
it("keeps an idempotency key after a network error and submits Persian amounts exactly", async () => {
  let attempts = 0;
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (options?.method === "POST") { if (++attempts === 1) throw new Error("ارتباط قطع شد."); return { id: "allocation" }; }
    if (path.includes("/invoices/invoice")) return { invoice, candidates: [bank], allocations: [], transaction_total: 1 };
    return { items: [invoice], total: 1 };
  });
  const { result } = renderHook(() => useSettlements("company", "owner"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.open("invoice"));
  await waitFor(() => expect(result.current.detail?.invoice).toEqual(invoice));
  act(() => result.current.chooseBank(bank));
  act(() => result.current.setAmount("۴۰"));
  await act(() => result.current.save());
  expect(result.current.actionError).toBe("ارتباط قطع شد.");
  await act(() => result.current.save());
  const calls = vi.mocked(api).mock.calls.filter(([, o]) => o?.method === "POST");
  const first = JSON.parse(String(calls[0][1]?.body)), retry = JSON.parse(String(calls[1][1]?.body));
  expect(first.amount_irr).toBe("40"); expect(retry).toEqual(first);
  expect(result.current.notice).toBe("تخصیص ثبت شد.");
});
it("formats integer rials above JavaScript's safe-number limit without rounding", () => {
  expect(settlementMoney("9007199254740993").replace(/٬/g, "")).toBe("۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳");
});
