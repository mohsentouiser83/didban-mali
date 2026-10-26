import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { api } from "@/lib/product-api";
import { useRecordLineage } from "./use-record-lineage";

it("retries a failed request and preserves exact values, zero and missing data", async () => {
  const request = vi.fn().mockRejectedValueOnce(Error("offline")).mockResolvedValue({ raw_values: { amount: "90071992547409931", row: 0, due: null }, normalized_fields: {} });
  const { result } = renderHook(() => useRecordLineage(true, "company", "ledger", "record", request as typeof api));
  await waitFor(() => expect(result.current.error).toBe("offline"));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe("");
  expect(result.current.rawFields.map(field => field.value)).toEqual(["90071992547409931", "0", "—"]);
});

it("aborts the previous record when selection changes and cancels on close", async () => {
  const request = vi.fn((_path: string, _options?: RequestInit) => new Promise(() => {}));
  const { rerender } = renderHook(({ open, record }) => useRecordLineage(open, "company", "ledger", record, request as typeof api), { initialProps: { open: true, record: "first" } });
  const firstSignal = request.mock.calls[0][1]!.signal!;
  rerender({ open: true, record: "second" });
  expect(firstSignal.aborted).toBe(true);
  const secondSignal = request.mock.calls[1][1]!.signal!;
  rerender({ open: false, record: "second" });
  expect(secondSignal.aborted).toBe(true);
});
