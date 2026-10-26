import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/product-api";
import { useMoadianComparison } from "./use-moadian-comparison";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
const batches = [
  { id: "sales", source_kind: "sales", status: "completed" },
  { id: "portal", source_kind: "moadian_sales", status: "completed_limited" },
  { id: "pending", source_kind: "moadian_sales", status: "awaiting_mapping" },
  { id: "purchase", source_kind: "purchases", status: "completed" },
];
it("offers completed files and keeps the applied report separate from draft changes", async () => {
  vi.mocked(api).mockImplementation(async (path) => path.includes("/imports?") ? batches.filter((b) => new URLSearchParams(path.split("?")[1]).get("source_kind") === b.source_kind) as never : { items: [], counts: {}, total: 0, limit: 25, offset: 0 } as never);
  const { result } = renderHook(() => useMoadianComparison("company"));
  await waitFor(() => expect(result.current.loadingFiles).toBe(false));
  expect(result.current.portalFiles.map((b) => b.id)).toEqual(["portal"]);
  act(() => result.current.changeSelection({ internal: ["sales"], portal: ["portal"], start: "2026-10-01", end: "2026-10-11" }));
  await act(async () => { await result.current.submit(); });
  await waitFor(() => expect(result.current.report).not.toBeNull());
  act(() => result.current.setOffset(25));
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([p]) => p.includes("offset=25"))).toBe(true));
  act(() => result.current.setStatus("difference"));
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([p]) => p.includes("status=difference") && p.includes("offset=0"))).toBe(true));
  act(() => result.current.changeSelection({ direction: "purchases" }));
  expect(result.current.selection.internal).toEqual([]);
  expect(result.current.report).not.toBeNull();
  expect(result.current.applied?.direction).toBe("sales");
  expect(result.current.internalFiles.map((b) => b.id)).toEqual(["purchase"]);
});
it("rejects incomplete selections and reversed dates before requesting a report", async () => {
  vi.mocked(api).mockResolvedValue([] as never);
  const { result } = renderHook(() => useMoadianComparison("company"));
  await waitFor(() => expect(result.current.loadingFiles).toBe(false));
  await act(async () => { await result.current.submit(); });
  expect(result.current.error).toContain("حداقل یک فایل");
  act(() => result.current.changeSelection({ internal: ["a"], portal: ["b"], start: "2026-10-11", end: "2026-10-01" }));
  await act(async () => { await result.current.submit(); });
  expect(result.current.error).toContain("تاریخ شروع");
  expect(vi.mocked(api).mock.calls.every(([p, options]) => !p.includes("/comparison?") && options?.method !== "POST")).toBe(true);
});


it("creates one saved comparison and only reads that snapshot for filters and pagination", async () => {
  const snapshot = { run_id: "saved", direction: "sales", internal_batch_id: "sales", portal_batch_id: "portal", internal_batch_ids: ["sales"], portal_batch_ids: ["portal"], start_date: "2026-10-01", end_date: "2026-10-11", items: [], counts: {}, total: 0, limit: 25, offset: 0 };
  vi.mocked(api).mockImplementation(async (path) => path.includes("/imports?") ? [] as never : path.endsWith("/comparisons?limit=25") ? [] as never : snapshot as never);
  const { result } = renderHook(() => useMoadianComparison("company", "owner"));
  await waitFor(() => expect(result.current.loadingFiles).toBe(false));
  act(() => result.current.changeSelection({ internal: ["sales"], portal: ["portal"], start: "2026-10-01", end: "2026-10-11" }));
  await act(async () => { await result.current.submit(); });
  act(() => result.current.setOffset(25));
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) => path.includes("/comparisons/saved?") && path.includes("offset=25"))).toBe(true));
  act(() => result.current.setStatus("difference"));
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) => path.includes("/comparisons/saved?") && path.includes("status=difference"))).toBe(true));
  expect(vi.mocked(api).mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  expect(vi.mocked(api).mock.calls.some(([path]) => path.includes("/comparison?"))).toBe(false);
});

it("opens a saved purchase report with its own direction without relying on recent history", async () => {
  vi.mocked(api).mockImplementation(async (path) => path.includes("/imports?") || path.endsWith("/comparisons?limit=25") ? [] as never : { run_id: "old", direction: "purchases", internal_batch_ids: ["purchase"], portal_batch_ids: ["portal-purchase"], start_date: "2026-10-01", end_date: "2026-10-11", items: [], counts: {}, total: 0, limit: 25, offset: 0 } as never);
  const { result } = renderHook(() => useMoadianComparison("company", "viewer", { initialRunId: "old" }));
  await waitFor(() => expect(result.current.selection.direction).toBe("purchases"));
  expect(result.current.selection.internal).toEqual(["purchase"]);
  expect(vi.mocked(api).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
});

it("invalidates explicit completeness confirmations when dates or selected files change", async () => {
  vi.mocked(api).mockResolvedValue([] as never);
  const { result } = renderHook(() => useMoadianComparison("company", "owner"));
  await waitFor(() => expect(result.current.loadingFiles).toBe(false));
  act(() => result.current.changeSelection({ internalComplete: true, portalComplete: true }));
  expect(result.current.selection.internalComplete).toBe(true);
  act(() => result.current.changeSelection({ start: "2026-10-01" }));
  expect(result.current.selection.internalComplete).toBe(false);
  expect(result.current.selection.portalComplete).toBe(false);
});
