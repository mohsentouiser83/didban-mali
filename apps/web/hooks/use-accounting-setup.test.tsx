import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useChartSetup } from "./use-accounting-setup";
vi.mock("./workspace", () => ({
  useWorkspace: () => ({
    companyPath: (path: string) => `/companies/test/${path}`,
  }),
}));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(api)
    .mockReset()
    .mockImplementation(async (path) =>
      path.endsWith("chart-template")
        ? { rows: [{ code: "0001", name: "Bank", active: true }] }
        : path.endsWith("chart-preview")
          ? { preview_id: "proof" }
          : { created_count: 1 },
    );
});
it("requires a fresh chart preview after edits and preserves leading zeros", async () => {
  const { result } = renderHook(() => useChartSetup(vi.fn()));
  act(() => {
    void result.current.loadTemplate();
  });
  await waitFor(() => expect(result.current.total).toBe(1));
  expect(result.current.visibleRows[0].code).toBe("0001");
  act(() => {
    void result.current.preview();
  });
  await waitFor(() => expect(result.current.previewId).toBe("proof"));
  act(() => result.current.change(0, { name: "بانک اصلاح‌شده" }));
  expect(result.current.previewId).toBeNull();
  act(() => {
    void result.current.apply();
  });
  expect(
    vi.mocked(api).mock.calls.some(([path]) => path.endsWith("chart-import")),
  ).toBe(false);
});
it("imports the exact preview and refreshes the account catalog", async () => {
  const refresh = vi.fn();
  const { result } = renderHook(() => useChartSetup(refresh));
  act(() => {
    void result.current.loadTemplate();
  });
  await waitFor(() => expect(result.current.total).toBe(1));
  act(() => {
    void result.current.preview();
  });
  await waitFor(() => expect(result.current.previewId).toBe("proof"));
  act(() => {
    void result.current.apply();
  });
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(
    vi
      .mocked(api)
      .mock.calls.find(([path]) => path.endsWith("chart-import"))?.[1]?.body,
  ).toEqual({ preview_id: "proof" });
  expect(result.current.total).toBe(0);
});
