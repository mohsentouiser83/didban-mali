import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useOperationDrafts } from "./use-operation-drafts";
import { useBotExtraction, useBotIntakeImport } from "./use-bot-intakes";
import { usePeriodAccounting } from "./use-period-accounting";

const state = vi.hoisted(() => ({
  workspace: {
    periodId: "current",
    company: { id: "company" },
    periods: [
      { id: "previous", start: "2026-01-01", end: "2026-06-30", previous_period_id: null },
      { id: "current", start: "2026-07-01", end: "2026-12-31", previous_period_id: null },
    ],
    canWrite: true,
    companyPath: (path: string) => `/companies/company/${path}`,
  },
  run: vi.fn(),
}));
vi.mock("./workspace", () => ({ useWorkspace: () => state.workspace }));
vi.mock("./use-command", () => ({ useCommand: () => ({ run: state.run, clearError: vi.fn() }) }));
vi.mock("./use-accounting", () => ({ useAccountOptions: () => ({ items: [] }) }));
vi.mock("./use-account-roles", () => ({ useAccountRoles: () => ({ resource: { data: { items: [] } } }) }));
vi.mock("./use-resource", () => ({ useResource: () => ({
  data: { items: [{ kind: "sale_service", amounts: ["amount"] }] },
}) }));
vi.mock("./use-paged-resource", () => ({ usePagedResource: () => ({ data: { items: [] }, refresh: vi.fn() }) }));
beforeEach(() => { state.workspace.periodId = "current"; state.run.mockReset(); });

it("uses the latest header period even when an operation form contains an older period", () => {
  const { result, rerender } = renderHook(() => useOperationDrafts());
  act(() => result.current.change({ period_id: "previous", description: "test" }));
  act(() => result.current.save());
  expect(state.run.mock.calls[0][1].body.period_id).toBe("current");
  state.workspace.periodId = "previous";
  rerender();
  act(() => result.current.save());
  expect(state.run.mock.calls[1][1].body.period_id).toBe("previous");
  state.workspace.periodId = "";
  rerender();
  act(() => result.current.save());
  expect(state.run).toHaveBeenCalledTimes(2);
});

it("uses the header for bot import and extraction review", () => {
  const { result, rerender } = renderHook(() => ({ intake: useBotIntakeImport(vi.fn()), extraction: useBotExtraction(vi.fn()) }));
  expect(result.current.intake.period).toBe("current");
  act(() => result.current.extraction.change({ period_id: "previous" }));
  expect(result.current.extraction.form.period_id).toBe("current");
  state.workspace.periodId = "previous";
  rerender();
  expect(result.current.intake.period).toBe("previous");
  expect(result.current.extraction.form.period_id).toBe("previous");
});

it("opens into the header period using its unique adjacent predecessor and blocks an unknown source", () => {
  const { result, rerender } = renderHook(() => usePeriodAccounting());
  act(() => { result.current.setKind("opening"); result.current.setReason("opening"); });
  act(() => result.current.save());
  expect(state.run.mock.calls[0][1].body).toMatchObject({ source_period_id: "previous", target_period_id: "current" });
  state.workspace.periodId = "previous";
  rerender();
  act(() => result.current.save());
  expect(state.run).toHaveBeenCalledTimes(1);
});
