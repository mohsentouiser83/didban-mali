import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useJournalDetails } from "./use-journal-details";
import type { JournalDraft } from "@/lib/accounting";

const state = vi.hoisted(() => ({
  path: null as string | null,
  items: [] as { id: string; draft_id: string }[],
  run: vi.fn(),
}));
vi.mock("./workspace", () => ({ useWorkspace: () => ({
  companyPath: (path: string) => `/companies/current/${path}`,
  periods: [{ id: "period", name: "سال" }],
}) }));
vi.mock("./use-resource", () => ({ useResource: (path: string | null) => {
  state.path = path;
  return { data: { items: state.items }, loading: false, refresh: vi.fn() };
} }));
vi.mock("./use-command", () => ({ useCommand: () => ({
  run: state.run, clearError: vi.fn(), busy: false,
}) }));
const draft = (id: string) => ({ id, period_id: "period", state: "posted" } as JournalDraft);
beforeEach(() => { state.items = []; state.run.mockReset(); });

it("never opens or reverses another journal while the selected document changes", () => {
  state.items = [{ id: "final-a", draft_id: "a" }];
  const { result } = renderHook(() => useJournalDetails(vi.fn()));
  expect(state.path).toBeNull();
  act(() => result.current.open(draft("a")));
  expect(state.path).toBe("/companies/current/accounting/journals?draft_id=a");
  expect(result.current.journal?.id).toBe("final-a");
  act(() => result.current.open(draft("b")));
  expect(result.current.journal).toBeUndefined();
  act(() => { result.current.setDate("2026-11-06"); result.current.setReason("اصلاح"); });
  act(() => result.current.saveReversal());
  expect(state.run).not.toHaveBeenCalled();
});

it("creates a correction draft for the selected final journal without posting it", () => {
  state.items = [{ id: "final-a", draft_id: "a" }];
  const onCreated = vi.fn();
  const { result } = renderHook(() => useJournalDetails(onCreated));
  act(() => result.current.open(draft("a")));
  act(() => { result.current.setDate("2026-11-06"); result.current.setReason(" اصلاح مبلغ "); });
  act(() => result.current.saveReversal());
  expect(state.run).toHaveBeenCalledWith(
    "/companies/current/accounting/journals/final-a/reversal-draft",
    { body: { period_id: "period", date: "2026-11-06", reason: "اصلاح مبلغ" } },
    expect.any(Function), expect.any(String),
  );
  expect(onCreated).not.toHaveBeenCalled();
  act(() => state.run.mock.calls[0][2]());
  expect(onCreated).toHaveBeenCalledOnce();
  expect(result.current.selected).toBeNull();
});
