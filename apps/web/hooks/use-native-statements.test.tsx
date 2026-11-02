import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useNativeStatements } from "./use-native-statements";
const data = vi.hoisted(() => ({
  period_id: "p",
  metrics: [
    {
      metric_key: "bank_balance",
      label: "بانک",
      value: null,
      status: "unavailable",
      known_subset_value: null,
      reason_codes: ["opening_evidence_missing"],
      unit: "IRR",
    },
  ],
  items: [],
  journal_ids: ["j"],
  as_of: "2026-11-02",
}));
vi.mock("./workspace", () => ({
  useWorkspace: () => ({
    company: { id: "c" },
    periodId: "p",
    periods: [{ id: "p" }],
    companyPath: (path: string) => `/companies/c/${path}`,
  }),
}));
vi.mock("./use-resource", () => ({
  useResource: () => ({ data, refresh: vi.fn() }),
}));
vi.mock("./use-paged-resource", () => ({
  usePagedResource: () => ({ data: { items: [] }, refresh: vi.fn() }),
}));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(api).mockReset().mockResolvedValue({
    id: "approval",
    actor_name: "مدیر",
    created_at: "2026-11-02T08:00:00Z",
  });
});
it("does not turn missing opening evidence into a zero bank balance", () => {
  const { result } = renderHook(() => useNativeStatements());
  expect(result.current.metrics[0].value).toBeNull();
  expect(result.current.metrics[0].reason).toContain("افتتاحیه");
});
it("approval pins the selected frozen run digest and never transfers to a different period", async () => {
  const { result } = renderHook(() => useNativeStatements());
  act(() =>
    result.current.selectRun({
      id: "fixed",
      digest: "f".repeat(64),
      created_at: "2026-11-02",
      snapshot: { ...data, metrics: [] },
      can_approve: true,
      approvals: [],
    }),
  );
  act(() => result.current.approve());
  await waitFor(() => expect(result.current.run?.approvals).toHaveLength(1));
  expect(vi.mocked(api).mock.calls[0]).toEqual([
    "/companies/c/accounting/statements/fixed/approvals",
    expect.objectContaining({ body: { digest: "f".repeat(64) } }),
  ]);
  act(() => result.current.setPeriod("next"));
  expect(result.current.run).toBeNull();
  expect(result.current.metrics[0].value).toBeNull();
});

it("saves the same explicit cutoff used by the preview rather than silently switching to period end", async () => {
  const { result } = renderHook(() => useNativeStatements());
  act(() => result.current.setAsOf("2026-09-15"));
  vi.mocked(api).mockResolvedValue({
    id: "saved",
    digest: "f".repeat(64),
    created_at: "2026-11-02",
    snapshot: { ...data, as_of: "2026-09-15" },
    approvals: [],
    can_approve: true,
  });
  act(() => result.current.save());
  await waitFor(() => expect(result.current.run?.id).toBe("saved"));
  expect(vi.mocked(api).mock.calls[0]).toEqual([
    "/companies/c/accounting/statements",
    expect.objectContaining({ body: { period_id: "p", as_of: "2026-09-15" } }),
  ]);
  expect(result.current.asOf).toBe("2026-09-15");
});

it("loads one exact frozen snapshot on demand from lightweight report history", async () => {
  const { result } = renderHook(() => useNativeStatements());
  vi.mocked(api).mockResolvedValue({
    id: "chosen",
    digest: "c".repeat(64),
    created_at: "2026-11-02",
    snapshot: { ...data },
    approvals: [],
    can_approve: true,
  });
  act(() =>
    result.current.selectRun({
      id: "chosen",
      digest: "c".repeat(64),
      created_at: "2026-11-02",
      can_approve: true,
      approvals: [],
      summary_only: true,
      snapshot: { period_id: "p", as_of: data.as_of },
    }),
  );
  await waitFor(() => expect(result.current.run?.id).toBe("chosen"));
  expect(vi.mocked(api).mock.calls[0]).toEqual([
    "/companies/c/accounting/statements/chosen",
    expect.objectContaining({ method: "GET" }),
  ]);
  expect(result.current.metrics[0].value).toBeNull();
});
