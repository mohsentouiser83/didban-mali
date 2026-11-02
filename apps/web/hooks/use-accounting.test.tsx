import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import type { JournalDraft } from "@/lib/accounting";
import {
  useAccountOptions,
  useJournalDrafts,
  useAccountingPermissions,
} from "./use-accounting";
const workspace = vi.hoisted(() => ({
  company: { id: "company-a", role: "owner" },
  periodId: "period-a",
  periods: [{ id: "period-a", name: "دوره" }],
  companyPath: (resource: string) =>
    `/companies/${workspace.company.id}/${resource}`,
}));
vi.mock("./workspace", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
const draft: JournalDraft = {
  id: "draft-a",
  version: 4,
  period_id: "period-a",
  date: "2026-11-01",
  description: "خدمات",
  original_unit: "IRR",
  state: "draft",
  lines: [
    { account_id: "a", party_id: "", debit: "100", credit: "0" },
    { account_id: "b", party_id: "", debit: "0", credit: "100" },
  ],
};
beforeEach(() => {
  workspace.company = { id: "company-a", role: "owner" };
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (path) =>
    path.endsWith("capabilities") ? { can_prepare: true } : { items: [] },
  );
});
it("does not submit unbalanced drafts and preserves fields after a version conflict", async () => {
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (options?.method === "PATCH")
      throw new ApiError(409, "پیش‌نویس تغییر کرده است.", "version_conflict");
    return path.endsWith("capabilities")
      ? { can_prepare: true }
      : { items: [] };
  });
  const { result } = renderHook(useJournalDrafts);
  act(() => result.current.open(draft));
  act(() => result.current.line(1, { credit: "90" }));
  act(() => result.current.save());
  expect(result.current.errors.balance).toBeTruthy();
  expect(
    vi
      .mocked(api)
      .mock.calls.some(([, options]) => options?.method === "PATCH"),
  ).toBe(false);
  act(() => result.current.line(1, { credit: "100" }));
  act(() => result.current.save());
  await waitFor(() =>
    expect(result.current.command.error?.code).toBe("version_conflict"),
  );
  expect(result.current.editing?.id).toBe(draft.id);
  expect(result.current.value.lines[1].credit).toBe("100");
  expect(
    vi
      .mocked(api)
      .mock.calls.find(([, options]) => options?.method === "PATCH"),
  ).toEqual([
    "/companies/company-a/accounting/drafts/draft-a",
    expect.objectContaining({
      version: 4,
      body: expect.objectContaining({ unit: "IRR" }),
    }),
  ]);
});
it("loads every account page and hides old-company options immediately on company change", async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    path.includes("company-b")
      ? new Promise(() => {})
      : path.includes("cursor=next")
        ? {
            items: [{ id: "b", code: "2", name: "بانک", active: true }],
            next_cursor: null,
          }
        : {
            items: [{ id: "a", code: "1", name: "هزینه", active: true }],
            next_cursor: "next",
          },
  );
  const { result, rerender } = renderHook(
    ({ companyId }) => useAccountOptions(companyId),
    { initialProps: { companyId: "company-a" } },
  );
  await waitFor(() => expect(result.current.items).toHaveLength(2));
  rerender({ companyId: "company-b" });
  expect(result.current.items).toEqual([]);
  expect(result.current.loading).toBe(true);
});
it("detects invalid account pagination rather than silently offering a partial catalog", async () => {
  vi.mocked(api).mockResolvedValue({
    items: [{ id: "a" }],
    next_cursor: "loop",
  });
  const { result } = renderHook(() => useAccountOptions("company-a"));
  await waitFor(() =>
    expect(result.current.error?.code).toBe("invalid_pagination"),
  );
  expect(result.current.items).toEqual([]);
});

it("refreshes accounting authority after membership roles change", async () => {
  let role = "finance_manager";
  vi.mocked(api).mockImplementation(async () => ({
    items: [
      {
        membership_id: "member-a",
        name: "عضو",
        role,
        version: 1,
        post_journal: false,
        reopen_period: false,
        implicit_authority: role === "finance_manager",
      },
    ],
  }));
  const membership = () => ({
    items: [
      {
        id: "member-a",
        user_id: "user-a",
        role,
        approve_financial_report: false,
        active: true,
        version: role === "finance_manager" ? 1 : 2,
      },
    ],
  });
  const { result, rerender } = renderHook(
    ({ members }) => useAccountingPermissions(members),
    { initialProps: { members: membership() } },
  );
  await waitFor(() =>
    expect(result.current.rows[0]?.implicit_authority).toBe(true),
  );
  role = "advisor";
  rerender({ members: membership() });
  await waitFor(() =>
    expect(result.current.rows[0]?.implicit_authority).toBe(false),
  );
  expect(result.current.rows[0]?.role).toBe("advisor");
});
it("allows draft creation only after setup loads and blocks it on a resource failure", async () => {
  let failed = false;
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.endsWith("capabilities")) return { can_prepare: true };
    if (path.includes("/drafts") && failed)
      throw new ApiError(500, "دریافت پیش‌نویس‌ها انجام نشد.", "unavailable");
    return {
      items: path.includes("/accounts")
        ? [{ id: "a", code: "1", name: "بانک", active: true }]
        : [],
    };
  });
  const { result } = renderHook(useJournalDrafts);
  expect(result.current.canCreateDraft).toBe(false);
  await waitFor(() => expect(result.current.canCreateDraft).toBe(true));
  expect(result.current.requiresAccounts).toBe(false);
  expect(result.current.requiresPeriod).toBe(false);
  failed = true;
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.error?.code).toBe("unavailable"));
  expect(result.current.canCreateDraft).toBe(false);
});
