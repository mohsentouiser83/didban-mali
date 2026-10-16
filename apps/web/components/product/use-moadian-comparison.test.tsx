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
it("only offers completed files of the selected direction and invalidates stale results", async () => {
  vi.mocked(api).mockImplementation(async (path) => path.includes("/imports?") ? batches.filter((b) => new URLSearchParams(path.split("?")[1]).get("source_kind") === b.source_kind) as never : { items: [], counts: {}, total: 0, limit: 25, offset: 0 } as never);
  const { result } = renderHook(() => useMoadianComparison("company"));
  await waitFor(() => expect(result.current.loadingFiles).toBe(false));
  expect(result.current.portalFiles.map((b) => b.id)).toEqual(["portal"]);
  act(() => result.current.changeSelection({ internal: "sales", portal: "portal", start: "2026-10-01", end: "2026-10-11" }));
  act(() => result.current.submit());
  await waitFor(() => expect(result.current.report).not.toBeNull());
  act(() => result.current.setOffset(25));
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([p]) => p.includes("offset=25"))).toBe(true));
  act(() => result.current.setStatus("difference"));
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([p]) => p.includes("status=difference") && p.includes("offset=0"))).toBe(true));
  act(() => result.current.changeSelection({ direction: "purchases" }));
  expect(result.current.selection.internal).toBe("");
  expect(result.current.report).toBeNull();
  expect(result.current.internalFiles.map((b) => b.id)).toEqual(["purchase"]);
});
it("rejects incomplete selections and reversed dates before requesting a report", async () => {
  vi.mocked(api).mockResolvedValue([] as never);
  const { result } = renderHook(() => useMoadianComparison("company"));
  await waitFor(() => expect(result.current.loadingFiles).toBe(false));
  act(() => result.current.submit());
  expect(result.current.error).toContain("دو فایل");
  act(() => result.current.changeSelection({ internal: "a", portal: "b", start: "2026-10-11", end: "2026-10-01" }));
  act(() => result.current.submit());
  expect(result.current.error).toContain("تاریخ شروع");
  expect(vi.mocked(api).mock.calls.every(([p]) => !p.includes("/comparison"))).toBe(true);
});
