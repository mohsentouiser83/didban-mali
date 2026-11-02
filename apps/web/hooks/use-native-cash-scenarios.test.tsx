import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import {
  useNativeCashScenarios,
  type NativeScenario,
} from "./use-native-cash-scenarios";
const state = vi.hoisted(() => ({
  canWrite: true,
  paths: [] as (string | null)[],
}));
const baseline = {
  native_statement_id: "frozen-native",
  source_digest: "a".repeat(64),
  as_of_date: "2026-11-01",
  start: "2026-11-02",
  end: "2026-12-01",
  horizon_days: 30,
  opening: "100",
  events: [],
  receipt_dates_inferred: false as const,
  financial_effect: false as const,
};
vi.mock("./workspace", () => ({
  useWorkspace: () => ({
    company: { id: "c" },
    unit: "IRR",
    canWrite: state.canWrite,
    companyPath: (s: string) => `/companies/c/${s}`,
  }),
}));
vi.mock("./use-resource", () => ({
  useResource: (path: string | null) => {
    state.paths.push(path);
    return {
      data: path?.includes("/forecast-baseline/")
        ? {
            ...baseline,
            forecast_run_id: "fixed-forecast",
            events: [
              {
                event_id: "native-invoice:i",
                date: "2026-11-12",
                direction: "receipt",
                amount: "100",
              },
            ],
          }
        : path?.includes("/baseline/")
          ? baseline
          : undefined,
      loading: false,
      refresh: vi.fn(),
    };
  },
}));
vi.mock("./use-paged-resource", () => ({
  usePagedResource: () => ({ data: { items: [] }, refresh: vi.fn() }),
}));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
const path = {
  opening: "100",
  closing: "100",
  minimum: "100",
  first_deficit: null,
  days: [],
  excluded_events: [],
  events: [],
};
const scenario: NativeScenario = {
  id: "s1",
  series_id: "series",
  version: 1,
  name: "آزمون",
  native_statement_id: "frozen-native",
  baseline,
  changes: { hypothetical: [] },
  comparison: {
    baseline: path,
    scenario: path,
    status: "estimated",
    closing_difference: "0",
  },
};
beforeEach(() => {
  state.canWrite = true;
  state.paths = [];
  vi.mocked(api).mockReset().mockResolvedValue(scenario);
});
it("pins native cash source and horizon, saves explicit hypotheses without an imported manifest", async () => {
  const { result } = renderHook(() => useNativeCashScenarios());
  act(() =>
    result.current.set({ statementId: "frozen-native", name: "آزمون" }),
  );
  expect(state.paths).toContain(
    "/companies/c/cashflow-scenarios/native/baseline/frozen-native?horizon_days=30",
  );
  act(() => result.current.addHypothetical());
  act(() =>
    result.current.updateHypothetical(0, {
      label: "دریافت فرضی",
      amount: "9",
      direction: "receipt",
      date: "2026-11-12",
    }),
  );
  await act(async () => {
    await result.current.save();
  });
  expect(api).toHaveBeenCalledWith(
    "/companies/c/cashflow-scenarios/native",
    expect.objectContaining({
      body: {
        name: "آزمون",
        native_statement_id: "frozen-native",
        horizon_days: 30,
        hypothetical: [
          {
            label: "دریافت فرضی",
            amount: "9",
            direction: "receipt",
            date: "2026-11-12",
            unit: "IRR",
          },
        ],
      },
    }),
  );
  expect(result.current.local.item?.id).toBe("s1");
  act(() => result.current.setActualId("actual-native"));
  expect(state.paths).toContain(
    "/companies/c/cashflow-scenarios/native/s1/evaluation?actual_statement_id=actual-native",
  );
  await act(async () => {
    await result.current.save();
  });
  expect(vi.mocked(api).mock.calls.at(-1)).toEqual([
    "/companies/c/cashflow-scenarios/native/s1",
    expect.objectContaining({ method: "PATCH", version: 1 }),
  ]);
  expect(
    state.paths.some(
      (p) => p?.includes("results/") || p?.includes("actual_manifest_id"),
    ),
  ).toBe(false);
});
it("ignores a late historical selection after starting a fresh scenario", async () => {
  let finish!: (item: NativeScenario) => void;
  vi.mocked(api).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }) as ReturnType<typeof api>,
  );
  const { result } = renderHook(() => useNativeCashScenarios());
  act(() => result.current.select("s1"));
  act(() => result.current.startNew());
  await act(async () => {
    finish(scenario);
  });
  expect(result.current.local.item).toBeNull();
  expect(result.current.local.statementId).toBe("");
  await waitFor(() => expect(result.current.command.busy).toBe(false));
});
it("does not issue a write for a viewer even when cash is available", async () => {
  state.canWrite = false;
  const { result } = renderHook(() => useNativeCashScenarios());
  act(() =>
    result.current.set({ statementId: "frozen-native", name: "آزمون" }),
  );
  await act(async () => {
    await result.current.save();
  });
  expect(api).not.toHaveBeenCalled();
});

it("pins a saved native forecast and sends explicit event-date shifts", async () => {
  const { result } = renderHook(() => useNativeCashScenarios());
  act(() => result.current.setSourceMode("forecast"));
  act(() =>
    result.current.set({ forecastId: "fixed-forecast", name: "سناریوی وصول" }),
  );
  expect(state.paths).toContain(
    "/companies/c/cashflow-scenarios/native/forecast-baseline/fixed-forecast",
  );
  act(() =>
    result.current.set({ shifts: { "native-invoice:i": "2026-11-20" } }),
  );
  await act(async () => {
    await result.current.save();
  });
  expect(api).toHaveBeenCalledWith(
    "/companies/c/cashflow-scenarios/native",
    expect.objectContaining({
      body: expect.objectContaining({
        native_statement_id: "frozen-native",
        forecast_run_id: "fixed-forecast",
        shifts: [{ event_id: "native-invoice:i", date: "2026-11-20" }],
      }),
    }),
  );
});
