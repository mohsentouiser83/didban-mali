import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { useNativeForecasts } from "./use-native-forecasts";
const state = vi.hoisted(() => ({
  canWrite: true,
  paths: [] as (string | null)[],
}));
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
    return { data: undefined, loading: false, refresh: vi.fn() };
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
const waiting = {
  id: "plan",
  version: 3,
  state: "waiting_input",
  native_statement_id: "cash",
  snapshot: { as_of: "2026-08-31" },
  questions: [
    {
      id: "question",
      key: "native-invoice:i",
      title: "زمان وصول؟",
      reason_code: "receipt_history_insufficient",
      amount: "100",
      reference: "INV",
      as_of: "2026-08-31",
    },
  ],
  forecast: null,
  forecast_run_id: null,
};
beforeEach(() => {
  state.canWrite = true;
  state.paths = [];
  vi.mocked(api).mockReset().mockResolvedValue(waiting);
});
it("persists pending plan across dialog close and resume, and submits an exact-version answer", async () => {
  const { result } = renderHook(() => useNativeForecasts());
  act(() => result.current.setStatementId("cash"));
  act(() => result.current.create());
  await waitFor(() => expect(result.current.dialogOpen).toBe(true));
  expect(result.current.run).toBeNull();
  expect(api).toHaveBeenCalledWith(
    "/companies/c/native-forecasts/plans",
    expect.objectContaining({
      body: { native_statement_id: "cash", obligations_complete: false },
    }),
  );
  act(() => result.current.setDialogOpen(false));
  expect(result.current.plan?.id).toBe("plan");
  expect(result.current.question?.id).toBe("question");
  act(() => result.current.load("plan"));
  await waitFor(() => expect(result.current.dialogOpen).toBe(true));
  act(() => result.current.setDate("2026-09-08"));
  act(() => result.current.answer());
  await waitFor(() => expect(vi.mocked(api).mock.calls).toHaveLength(3));
  expect(vi.mocked(api).mock.calls.at(-1)).toEqual([
    "/companies/c/native-forecasts/plans/plan/answers",
    expect.objectContaining({
      version: 3,
      body: {
        question_id: "question",
        unknown: false,
        expected_date: "2026-09-08",
      },
    }),
  ]);
});
it("keeps source-stale errors and unanswered question visible without publishing a forecast", async () => {
  const { result } = renderHook(() => useNativeForecasts());
  act(() => result.current.load("plan"));
  await waitFor(() => expect(result.current.plan?.id).toBe("plan"));
  vi.mocked(api).mockRejectedValueOnce(
    new ApiError(
      409,
      "فاکتور تغییر کرده؛ برنامه تازه بسازید.",
      "native_forecast_source_changed",
    ),
  );
  act(() => result.current.setUnknown(true));
  act(() => result.current.answer());
  await waitFor(() =>
    expect(result.current.command.error?.code).toBe(
      "native_forecast_source_changed",
    ),
  );
  expect(result.current.run).toBeNull();
  expect(result.current.dialogOpen).toBe(true);
});
it("publishes explicit unknown as limited and pins actual comparison to native statement only", async () => {
  const { result } = renderHook(() => useNativeForecasts());
  act(() => result.current.load("plan"));
  await waitFor(() => expect(result.current.plan?.id).toBe("plan"));
  vi.mocked(api).mockResolvedValueOnce({
    ...waiting,
    state: "completed_limited",
    questions: [],
    forecast_run_id: "forecast",
    forecast: {
      id: "forecast",
      native_statement_id: "cash",
      snapshot: {
        status: "limited",
        closing: "1000",
        minimum: "900",
        first_deficit: null,
        events: [],
        reason_codes: ["receipt_date_unknown"],
      },
    },
  });
  act(() => result.current.setUnknown(true));
  act(() => result.current.answer());
  await waitFor(() =>
    expect(result.current.run?.snapshot.status).toBe("limited"),
  );
  expect(result.current.dialogOpen).toBe(false);
  expect(result.current.forecast?.closing).toBeNull();
  expect(result.current.forecast?.known_dated_closing).toBe("1000");
  expect(result.current.run?.snapshot.closing).toBe("1000");
  act(() => result.current.setActualId("actual"));
  expect(state.paths).toContain(
    "/companies/c/native-forecasts/runs/forecast/evaluation?actual_statement_id=actual",
  );
  expect(state.paths.some((path) => path?.includes("actual_manifest_id"))).toBe(
    false,
  );
});
it("disables forecast publication and answers for viewers", () => {
  state.canWrite = false;
  const { result } = renderHook(() => useNativeForecasts());
  act(() => result.current.setStatementId("cash"));
  act(() => result.current.create());
  act(() => result.current.answer());
  expect(api).not.toHaveBeenCalled();
});
