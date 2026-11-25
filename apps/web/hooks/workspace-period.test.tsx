import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "./workspace";

const state = vi.hoisted(() => ({
  periods: [
    { id: "old", name: "گذشته", start: "2025-01-01", end: "2025-12-31", version: 1 },
    { id: "future", name: "آینده", start: "2027-01-01", end: "2027-12-31", version: 1 },
    { id: "current", name: "جاری", start: "2026-01-01", end: "2026-12-31", version: 1 },
  ],
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const router = { replace: vi.fn() };
vi.mock("@/lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api")>(),
  api: vi.fn(async (path: string) => path === "/auth/me"
    ? { user: { id: "user" }, csrf: "test" }
    : { items: [{ id: "company", role: "owner" }, { id: "empty", role: "owner" }] }),
  setCsrf: vi.fn(),
}));
vi.mock("./use-period-options", () => ({
  usePeriodOptions: (id: string) => ({
    data: id === "company" ? state.periods : [],
    loading: false,
    refresh: vi.fn(),
  }),
}));
const originalPeriods = [...state.periods];
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  state.periods = [...originalPeriods];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const openWorkspace = () => renderHook(() => useWorkspace(), { wrapper: WorkspaceProvider });

it("selects and persists the current year before exposing a ready workspace", async () => {
  const { result } = openWorkspace();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.periodId).toBe("current");
  expect(localStorage.getItem("didban-period:company")).toBe("current");
  act(() => result.current.setPeriodId(""));
  expect(result.current.periodId).toBe("current");
});

it("keeps a valid saved year and persists explicit changes", async () => {
  localStorage.setItem("didban-period:company", "old");
  const { result } = openWorkspace();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.periodId).toBe("old");
  act(() => result.current.setPeriodId("future"));
  expect(result.current.periodId).toBe("future");
  expect(localStorage.getItem("didban-period:company")).toBe("future");
});

it("recovers a deleted saved year and rejects a foreign period", async () => {
  localStorage.setItem("didban-period:company", "deleted");
  const { result } = openWorkspace();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.periodId).toBe("current");
  act(() => result.current.setPeriodId("foreign"));
  expect(result.current.periodId).toBe("current");
});

it("selects the newest defined year when no period covers today", async () => {
  state.periods = state.periods.filter((period) => period.id !== "current");
  const { result } = openWorkspace();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.periodId).toBe("future");
});

it("does not reuse another company's year and restores selection on return", async () => {
  const { result } = openWorkspace();
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => result.current.setPeriodId("old"));
  act(() => result.current.setCompany("empty"));
  expect(result.current.periodId).toBe("");
  act(() => result.current.setCompany("company"));
  expect(result.current.periodId).toBe("old");
});
