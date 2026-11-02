import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useOperationLearning, type OperationSuggestion } from "./use-operation-learning";
const item: OperationSuggestion = {
  operation_id: "origin", kind: "sale_service", journal_id: "journal", journal_sequence: 2,
  journal_digest: "digest", approved_draft_version: 1, policy_version: "v1",
  accounts: { trade_receivable: { id: "ar", code: "1101", name: "مطالبات", version: 1 } },
  name: "فروش", enabled: true, version: 1,
};
vi.mock("./use-paged-resource", () => ({ usePagedResource: () => ({ data: { items: [item] }, refresh: vi.fn() }) }));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("@/lib/api")>()), api: vi.fn() }));
const scope = () => ({ company: { id: "c", role: "advisor" }, user: { id: "u" }, canWrite: true,
  companyPath: (path: string) => `/companies/c/${path}` });
const fields = () => ({ kind: "sale_service", party_id: "customer", accounts: { trade_receivable: "human-choice" } });
beforeEach(() => { vi.mocked(api).mockReset(); });
it("leaves human fields untouched until an explicit click and revalidates through server before applying", async () => {
  vi.mocked(api).mockResolvedValue(item);
  const apply = vi.fn();
  const { result } = renderHook(() => useOperationLearning(scope(), fields(), [], apply));
  expect(apply).not.toHaveBeenCalled(); expect(api).not.toHaveBeenCalled();
  act(() => result.current.applySuggestion(item));
  await waitFor(() => expect(apply).toHaveBeenCalledWith({ trade_receivable: "ar" }));
  expect(vi.mocked(api).mock.calls[0][0]).toContain("/origin?kind=sale_service&party_id=customer");
  expect(vi.mocked(api).mock.calls[0][1]?.method).toBe("GET");
});
it("drops an in-flight proposal after human account edits or permission changes", async () => {
  let resolve: (value: OperationSuggestion) => void = () => {};
  vi.mocked(api).mockImplementation(() => new Promise((done) => { resolve = done; }));
  const apply = vi.fn();
  const workspace = scope(); let form = fields();
  const { result, rerender } = renderHook(() => useOperationLearning(workspace, form, [], apply));
  act(() => result.current.applySuggestion(item));
  form = { ...form, accounts: { trade_receivable: "later-human-choice" } }; rerender();
  await act(async () => resolve(item)); expect(apply).not.toHaveBeenCalled();
  act(() => result.current.applySuggestion(item));
  workspace.canWrite = false; workspace.company.role = "viewer"; rerender();
  await act(async () => resolve(item)); expect(apply).not.toHaveBeenCalled();
});
it("excludes personnel and disabled suggestions", () => {
  const apply = vi.fn();
  let form = { ...fields(), kind: "payroll" };
  const { result, rerender } = renderHook(() => useOperationLearning(scope(), form, [], apply));
  expect(result.current.available).toBe(false);
  act(() => result.current.applySuggestion(item)); expect(api).not.toHaveBeenCalled();
  form = fields(); rerender();
  act(() => result.current.applySuggestion({ ...item, enabled: false })); expect(api).not.toHaveBeenCalled();
});
