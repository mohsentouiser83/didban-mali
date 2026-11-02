import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useNativeControls } from "./use-native-controls";
const state = vi.hoisted(() => ({ detailReady: true }));
vi.mock("./workspace", () => ({
  useWorkspace: () => ({
    user: { id: "u" },
    company: { id: "c" },
    canWrite: true,
    periods: [
      { id: "p", name: "اول" },
      { id: "p2", name: "دوم" },
    ],
    companyPath: (path: string) => `/companies/c/${path}`,
  }),
}));
vi.mock("./use-command", () => ({
  useCommand: () => ({ busy: false, run: vi.fn() }),
}));
vi.mock("./use-paged-resource", () => ({
  usePagedResource: () => ({ data: { items: [] }, refresh: vi.fn() }),
}));
function snapshot(period: string) {
  return {
    basis: "native_book",
    period_id: period,
    period: { name: period },
    journal_refs: [
      {
        journal_id: period,
        sequence: 1,
        digest: "sha",
        date: "2026-11-01",
        approved_draft_version: 1,
      },
    ],
    role_assignments: [],
    findings: [],
    expense_comparison: { rows: [] },
  };
}
vi.mock("./use-resource", () => ({
  useResource: (path: string | null) => ({
    data: !path
      ? undefined
      : path.includes("/runs/")
        ? state.detailReady
          ? { snapshot: snapshot("saved-p") }
          : undefined
        : snapshot(path.includes("period_id=p2") ? "p2" : "p"),
    loading: !!path?.includes("/runs/") && !state.detailReady,
    refresh: vi.fn(),
  }),
}));
beforeEach(() => {
  state.detailReady = true;
});
it("clears saved audit and journal evidence when the period changes", () => {
  const { result } = renderHook(useNativeControls);
  expect(result.current.snapshot?.period_id).toBe("p");
  act(() => result.current.selectRun("audit"));
  expect(result.current.snapshot?.period_id).toBe("saved-p");
  act(() =>
    result.current.openEvidence("شواهد", result.current.snapshot!.journal_refs),
  );
  expect(result.current.evidence?.refs[0].journal_id).toBe("saved-p");
  act(() => result.current.setPeriod("p2"));
  expect(result.current.runId).toBeNull();
  expect(result.current.snapshot?.period_id).toBe("p2");
  expect(result.current.evidence).toBeNull();
});
it("does not present current financial data as a saved audit while the saved version loads", () => {
  state.detailReady = false;
  const { result } = renderHook(useNativeControls);
  act(() => result.current.selectRun("audit"));
  expect(result.current.resource.loading).toBe(true);
  expect(result.current.snapshot).toBeUndefined();
});
