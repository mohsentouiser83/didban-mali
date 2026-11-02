import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { useConsolidation } from "./use-consolidation";
import type { ConsolidationDraft } from "@/lib/consolidation";

const workspace = vi.hoisted(() => ({
  user: { id: "user" }, company: { id: "company", role: "finance_manager" }, canWrite: true, canApprove: true,
  companyPath: (path: string) => `/companies/${workspace.company.id}/${path}`,
}));
vi.mock("./workspace", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", async original => ({ ...await original<typeof import("@/lib/api")>(), api: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
const draft: ConsolidationDraft = {
  id: "draft", digest: "a".repeat(64), created_at: "2026-11-02", can_approve: true,
  approval_policy: "policy", approval_scope: "selected_intercompany_eliminations", approval_status: "unapproved", approvals: [],
  snapshot: { title: "منتخب", company_ids: ["company", "child"], period: { start: "2026-01-01", end: "2026-01-31" },
    status: "draft", limitation: "محدود", approval_available: true, metrics: [], pairs: [] },
};
beforeEach(() => {
  workspace.canApprove = true;
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async path => {
    if (path.endsWith("/approval-preview")) return { draft_id: "draft", expected_digest: draft.digest, policy_version: "policy", can_approve: true, draft, financial_effect: false };
    if (path.endsWith("/approvals")) return { id: "approval", actor_id: "user", created_at: "2026-11-02", draft_digest: draft.digest, policy_version: "policy", permission_provenance: "role:finance_manager" };
    if (path.endsWith("/drafts/draft")) return draft;
    return { items: [], next_cursor: null };
  });
});
it("requires a server preview and sends only its exact digest/policy", async () => {
  const { result } = renderHook(() => useConsolidation());
  act(() => result.current.viewDraft(draft));
  await waitFor(() => expect(result.current.draft?.id).toBe("draft"));
  act(() => result.current.approve());
  expect(vi.mocked(api).mock.calls.some(([path]) => path.endsWith("/approvals"))).toBe(false);
  act(() => result.current.openApproval());
  await waitFor(() => expect(result.current.approvalPreview.data?.expected_digest).toBe(draft.digest));
  act(() => result.current.approve());
  await waitFor(() => expect(result.current.draft?.approval_status).toBe("approved_selected_eliminations"));
  const call = vi.mocked(api).mock.calls.find(([path]) => path.endsWith("/approvals"));
  expect(call?.[1]?.body).toEqual({ expected_digest: draft.digest, policy_version: "policy" });
  expect(result.current.approvalOpen).toBe(false);
  expect(result.current.canReviewApproval).toBe(false);
});
it("permission removal after preview blocks client submission", async () => {
  const { result, rerender } = renderHook(() => useConsolidation());
  act(() => result.current.viewDraft(draft));
  await waitFor(() => expect(result.current.draft?.id).toBe("draft"));
  act(() => result.current.openApproval());
  await waitFor(() => expect(result.current.approvalPreview.data).toBeDefined());
  workspace.canApprove = false; rerender();
  act(() => result.current.approve());
  expect(vi.mocked(api).mock.calls.some(([path]) => path.endsWith("/approvals"))).toBe(false);
});
it("retains the review and error when the server rejects an approval", async () => {
  vi.mocked(api).mockImplementation(async path => {
    if (path.endsWith("/approval-preview")) return { draft_id: "draft", expected_digest: draft.digest, policy_version: "policy", can_approve: true, draft };
    if (path.endsWith("/approvals")) throw new ApiError(403, "مجوز تغییر کرده است.", "permission_denied");
    if (path.endsWith("/drafts/draft")) return draft;
    return { items: [], next_cursor: null };
  });
  const { result } = renderHook(() => useConsolidation());
  act(() => result.current.viewDraft(draft));
  await waitFor(() => expect(result.current.draft?.id).toBe("draft"));
  act(() => result.current.openApproval());
  await waitFor(() => expect(result.current.approvalPreview.data).toBeDefined());
  act(() => result.current.approve());
  await waitFor(() => expect(result.current.approvalCommand.error?.code).toBe("permission_denied"));
  expect(result.current.approvalOpen).toBe(true);
  expect(result.current.draft?.approvals).toEqual([]);
});
