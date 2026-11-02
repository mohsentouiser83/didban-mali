import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useNativeDashboard } from "./use-native-dashboard";
const workspace = vi.hoisted(() => ({
  companyPath: (path: string) => `/companies/a/${path}`,
  periodId: "p",
}));
vi.mock("./workspace", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
beforeEach(() => vi.mocked(api).mockReset());
it("loads only the selected native period and preserves a missing cash value", async () => {
  vi.mocked(api).mockResolvedValue({
    id: "fixed-native",
    source: "native_statement",
    period: { name: "دوره" },
    as_of: "2026-11-01",
    metrics: [
      {
        metric_key: "cash",
        value: null,
        status: "unavailable",
        reason: "مبنای افتتاحیه موجود نیست",
      },
      { metric_key: "revenue", value: "0", status: "available" },
    ],
  });
  const { result } = renderHook(useNativeDashboard);
  await waitFor(() => expect(result.current.data?.id).toBe("fixed-native"));
  expect(vi.mocked(api).mock.calls[0][0]).toBe(
    "/companies/a/accounting/statements/summary/latest?period_id=p",
  );
  expect(result.current.cash?.value).toBeNull();
  expect(result.current.data?.metrics[1].value).toBe("0");
  expect(
    vi.mocked(api).mock.calls.some(([path]) => path.includes("results/latest")),
  ).toBe(false);
});
