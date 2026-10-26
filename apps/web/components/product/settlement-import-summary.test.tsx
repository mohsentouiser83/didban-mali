import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SettlementImportSummaryView } from "./settlement-import-summary";
import { useSettlementImport } from "./use-settlement-import";
import { api } from "@/lib/product-api";
import type { ImportBatch } from "@/lib/product-types";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.mocked(api).mockReset(); });
const batch: ImportBatch = { id: "s1", source_kind: "settlement_sales", source_label: "ریز تسویه", status: "completed_limited", stage: "normalized", progress: 100,
  original_name: "settlements.csv", size_bytes: 100, sha256: "test", scan_status: "clean", duplicate_detected: false, failure_message: null, created_at: "2026-10-16T00:00:00Z",
  coverage: { settlement_results: { matched: 1, review: 2 } } };
it("keeps review counts visible and disables retry during processing", () => {
  render(<SettlementImportSummaryView counts={{ matched: 1, review: 2 }} busy error="" canRetry onRetry={() => {}} />);
  expect(screen.getByText("نیازمند بررسی")).toBeVisible();
  expect(screen.getByRole("button", { name: "بررسی دوباره موارد حل‌نشده" })).toBeDisabled();
});
it("polls only after retry is accepted and refreshes the report when it finishes", async () => {
  vi.useFakeTimers();
  const updated = vi.fn();
  vi.mocked(api).mockResolvedValueOnce({ status: "queued" } as never).mockResolvedValueOnce({ ...batch, status: "completed" } as never);
  const { result } = renderHook(() => useSettlementImport("c1", batch, updated));
  await act(async () => { await result.current.retry(); });
  expect(result.current.busy).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(result.current.busy).toBe(false);
  expect(updated).toHaveBeenCalledOnce();
});
it("retains the previous summary on a retry error", async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error("صف در دسترس نیست"));
  const { result } = renderHook(() => useSettlementImport("c1", batch, vi.fn()));
  await act(async () => { await result.current.retry(); });
  await waitFor(() => expect(result.current.error).toBe("صف در دسترس نیست"));
  expect(result.current.counts?.review).toBe(2);
  expect(result.current.busy).toBe(false);
});
