import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { useGroupMatches, type GroupMatch } from "./use-group-matches";
const workspace = vi.hoisted(() => ({
  company: { id: "company-a" },
  canWrite: true,
  companyPath: (resource: string) => `/companies/${workspace.company.id}/${resource}`,
}));
vi.mock("./workspace", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", async original => ({
  ...(await original<typeof import("@/lib/api")>()), api: vi.fn(),
}));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
function group(id = "group-a", canAccept = true): GroupMatch {
  return { id, bank_ids: ["b1", "b2"], ledger_ids: ["l1", "l2"], reference: "روز", bank_total: "30",
    ledger_total: canAccept ? "30" : "29", difference: canAccept ? "0" : "1", dates: ["2026-09-05"],
    can_accept: canAccept, version: 1, status: "needs_review", reason_codes: ["shared_reference_missing"], evidence_refs: [] };
}
beforeEach(() => {
  workspace.company = { id: "company-a" }; workspace.canWrite = true;
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({ items: [group()] });
});
function mutations() { return vi.mocked(api).mock.calls.filter(([, options]) => options?.method === "POST"); }

it("drops selection and stale callbacks on a run change even without a parent remount", async () => {
  const { result, rerender } = renderHook(({ runId }) => useGroupMatches(runId), { initialProps: { runId: "run-a" } });
  await waitFor(() => expect(result.current.resource.loading).toBe(false));
  act(() => { result.current.open(group()); });
  act(() => { result.current.setReason("جمع بررسی شد"); });
  expect(result.current.canSubmit).toBe(true);
  const oldSubmit = result.current.submit;
  rerender({ runId: "run-b" });
  expect(result.current.selected).toBeNull(); expect(result.current.reason).toBe("");
  act(() => { oldSubmit(); result.current.submit(); });
  expect(mutations()).toHaveLength(0);
});

it("drops company data and old actions when the selected company changes", async () => {
  const { result, rerender } = renderHook(() => useGroupMatches("run-a"));
  await waitFor(() => expect(result.current.resource.loading).toBe(false));
  act(() => result.current.open(group()));
  act(() => result.current.setReason("بررسی شرکت الف"));
  const oldSubmit = result.current.submit;
  workspace.company = { id: "company-b" }; rerender();
  expect(result.current.selected).toBeNull();
  expect(result.current.rows).toEqual([]);
  act(() => { oldSubmit(); result.current.submit(); });
  expect(mutations()).toHaveLength(0);
});

it("read-only membership and a role downgrade prevent client mutations", async () => {
  const { result, rerender } = renderHook(() => useGroupMatches("run-a"));
  await waitFor(() => expect(result.current.resource.loading).toBe(false));
  act(() => result.current.open(group()));
  act(() => result.current.setReason("بررسی"));
  const oldSubmit = result.current.submit;
  workspace.canWrite = false; rerender();
  expect(result.current.canSubmit).toBe(false);
  act(() => { oldSubmit(); result.current.submit(); });
  expect(mutations()).toHaveLength(0);
});

it("an amount mismatch never offers or submits acceptance, but allows explicit rejection", async () => {
  const { result } = renderHook(() => useGroupMatches("run-a"));
  await waitFor(() => expect(result.current.resource.loading).toBe(false));
  act(() => result.current.open(group("mismatch", false)));
  act(() => { result.current.setDecision("accepted"); result.current.setReason("جمع‌ها برابر نیستند"); });
  expect(result.current.decision).toBe("rejected");
  expect(result.current.options.map(option => option.value)).toEqual(["rejected"]);
  await act(async () => { await result.current.submit(); });
  expect(mutations()[0][1]?.body).toMatchObject({ decision: "rejected", expected_version: 1 });
});

it("a version error preserves the displayed evidence and entered reason", async () => {
  vi.mocked(api).mockImplementation(async (_path, options) => {
    if (options?.method === "POST") throw new ApiError(409, "نسخه تغییر کرده است.", "version_conflict");
    return { items: [group()] };
  });
  const { result } = renderHook(() => useGroupMatches("run-a"));
  await waitFor(() => expect(result.current.resource.loading).toBe(false));
  act(() => result.current.open(group()));
  act(() => result.current.setReason("دلیل بررسی حفظ شود"));
  await act(async () => { await result.current.submit(); });
  expect(result.current.command.error?.code).toBe("version_conflict");
  expect(result.current.selected?.id).toBe("group-a");
  expect(result.current.reason).toBe("دلیل بررسی حفظ شود");
  expect(mutations()[0][1]?.version).toBe(1);
});

it("pagination is bounded and scoped to the current run", async () => {
  vi.mocked(api).mockResolvedValue({ items: Array.from({ length: 26 }, (_, index) => group(String(index))) });
  const { result, rerender } = renderHook(({ runId }) => useGroupMatches(runId), { initialProps: { runId: "run-a" } });
  await waitFor(() => expect(result.current.rows).toHaveLength(25));
  act(() => result.current.next()); expect(result.current.rows).toHaveLength(1);
  act(() => result.current.next()); expect(result.current.page).toBe(1);
  rerender({ runId: "run-b" }); expect(result.current.page).toBe(0);
});

it("requires explicit adoption of a newly read decision version while preserving the reason", async () => {
  let version = 1;
  vi.mocked(api).mockImplementation(async () => ({ items: [{ ...group(), version }] }));
  const { result } = renderHook(() => useGroupMatches("run-a"));
  await waitFor(() => expect(result.current.resource.loading).toBe(false));
  act(() => result.current.open(group()));
  act(() => result.current.setReason("شرح بررسی باقی بماند"));
  version = 2;
  act(() => result.current.resource.refresh());
  await waitFor(() => expect(result.current.newerVersionAvailable).toBe(true));
  expect(result.current.selected?.version).toBe(1);
  expect(result.current.canSubmit).toBe(false);
  act(() => result.current.adoptLatest());
  expect(result.current.selected?.version).toBe(2);
  expect(result.current.reason).toBe("شرح بررسی باقی بماند");
  expect(result.current.canSubmit).toBe(true);
});

it("notifies the parent result projection after a group decision", async () => {
  const refreshParent=vi.fn();
  const {result}=renderHook(()=>useGroupMatches("run-a",refreshParent));
  await waitFor(()=>expect(result.current.resource.loading).toBe(false));
  act(()=>result.current.open(group()));
  act(()=>result.current.setReason("بررسی گروه"));
  await act(async()=>{await result.current.submit();});
  expect(refreshParent).toHaveBeenCalledTimes(1);
});
