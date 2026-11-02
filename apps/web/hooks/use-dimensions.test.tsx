import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { DimensionReport } from "@/lib/dimensions";
import { useDimensionReporting } from "./use-dimensions";
const state = vi.hoisted(() => ({
  report: undefined as unknown,
  manifestId: "manifest-a",
  workspace: {
    company: { id: "company-a" },
    periodId: "p",
    canWrite: true,
    companyPath: (path: string) => `/companies/company-a/${path}`,
  },
}));
vi.mock("./use-financial-view", () => ({
  useFinancialView: () => ({
    workspace: state.workspace,
    manifest: { id: state.manifestId },
    loading: false,
    error: undefined,
    refresh: vi.fn(),
  }),
}));
vi.mock("./use-resource", () => ({
  useResource: (path: string) => ({
    data: path.includes("report/current") ? state.report : { items: [] },
    loading: false,
    error: undefined,
    refresh: vi.fn(),
  }),
}));
vi.mock("./use-paged-resource", () => ({
  usePagedResource: () => ({
    data: { items: [] },
    loading: false,
    error: undefined,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
function snapshot(id = "manifest-a", kind = "project"): DimensionReport {
  return {
    manifest_id: id,
    kind,
    status: "limited",
    reason: "تخصیص ناقص",
    period: { name: "دوره", start: "2026-09-01", end: "2026-09-30" },
    unassigned: {
      revenue: "9007199254740993123",
      expense: "0",
      line_count: 60,
    },
    buckets: Array.from({ length: 30 }, (_, index) => ({
      id: String(index),
      name: String(index),
      code: String(index),
      revenue: "0",
      expense: "0",
      assigned_net: "0",
      profit: null,
    })),
    lines: Array.from({ length: 60 }, (_, index) => ({
      id: String(index),
      account: String(index),
      role: "revenue",
      category: "revenue",
      date: "2026-09-05",
      amount: "1",
      source_row_id: String(index),
      allocation: null,
    })),
  };
}
beforeEach(() => {
  vi.mocked(api).mockReset().mockResolvedValue({});
  state.manifestId = "manifest-a";
  state.report = snapshot();
});
it("paginates dimensions and source lines independently while keeping unassigned scope visible", () => {
  const { result } = renderHook(() => useDimensionReporting());
  expect(result.current.bucketRows).toHaveLength(25);
  expect(result.current.rows).toHaveLength(25);
  act(() => result.current.nextBucket());
  expect(result.current.bucketRows).toHaveLength(5);
  expect(result.current.page).toBe(0);
  expect(result.current.snapshot?.unassigned.revenue).toBe(
    "9007199254740993123",
  );
  act(() => result.current.next());
  expect(result.current.page).toBe(1);
  act(() =>
    result.current.selectSaved({
      id: "frozen-b",
      created_at: "2026-11-01",
      snapshot: snapshot("old", "branch"),
    }),
  );
  expect(result.current.page).toBe(0);
  expect(result.current.bucketPage).toBe(0);
  expect(result.current.snapshot?.kind).toBe("branch");
});
it("resets source and dimension pagination when the current manifest changes", () => {
  const { result, rerender } = renderHook(() => useDimensionReporting());
  act(() => {
    result.current.nextBucket();
    result.current.next();
  });
  state.manifestId = "manifest-b";
  state.report = snapshot("manifest-b");
  rerender();
  expect(result.current.page).toBe(0);
  expect(result.current.bucketPage).toBe(0);
});

it("uses the frozen native statement for allocation and clears dialogs when changing source", async () => {
  state.report = {
    ...snapshot(),
    manifest_id: null,
    native_statement_id: "native-fixed",
    source: "native_statement",
  };
  const { result } = renderHook(useDimensionReporting);
  act(() => result.current.setSource("native_statement"));
  act(() => result.current.open(result.current.rows[0]));
  act(() => {
    result.current.changeShare(0, { dimension_id: "project-a" });
    result.current.setReason("تخصیص صریح");
  });
  act(() => result.current.assign());
  await waitFor(() => expect(api).toHaveBeenCalled());
  expect(vi.mocked(api).mock.calls[0][1]?.body).toEqual(
    expect.objectContaining({
      native_statement_id: "native-fixed",
      line_id: "0",
    }),
  );
  expect(vi.mocked(api).mock.calls[0][1]?.body).not.toHaveProperty(
    "manifest_id",
  );
  act(() => result.current.open(result.current.rows[0]));
  act(() => result.current.setSource("imported_manifest"));
  expect(result.current.selected).toBeNull();
});
