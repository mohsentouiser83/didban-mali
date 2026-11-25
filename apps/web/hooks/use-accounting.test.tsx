import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import type { JournalDraft } from "@/lib/accounting";
import {
  useAccountOptions,
  useJournalDrafts,
  useAccountingPermissions,
  useLedgerAccounts,
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
        view_payroll: false,
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

it("manages ledger accounts with nature in creation and editing", async () => {
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path.endsWith("capabilities")) return { can_manage_accounts: true };
    if (path.endsWith("accounting/accounts") && options?.method === "POST") {
      return { id: "new-acc", version: 1, ...(options.body as object) };
    }
    if (path.includes("accounting/accounts/acc-1") && options?.method === "PATCH") {
      return { id: "acc-1", version: 2, ...(options.body as object) };
    }
    return {
      items: [
        { id: "acc-1", code: "101", name: "بانک", nature: "debit", active: true, version: 1 },
      ],
    };
  });

  const { result } = renderHook(useLedgerAccounts);

  // Initial state for new account defaults to group with auto-suggested 2-digit code
  act(() => result.current.open(null));
  expect(result.current.value.nature).toBe("debit");
  expect(result.current.value.code).toBe("01");
  expect(result.current.value.level).toBe("group");
  expect(result.current.value.active).toBe(true);

  // Change fields including nature and 2-digit group code
  act(() => {
    result.current.change({ code: "21", name: "بستانکاران", nature: "credit" });
  });
  expect(result.current.value.nature).toBe("credit");

  // Save new account
  act(() => result.current.save());
  await waitFor(() => {
    const postCall = vi
      .mocked(api)
      .mock.calls.find(
        ([path, opts]) => path.endsWith("accounting/accounts") && opts?.method === "POST",
      );
    expect(postCall).toBeTruthy();
    expect(postCall?.[1]?.body).toEqual({
      code: "21",
      name: "بستانکاران",
      nature: "credit",
      active: true,
      level: "group",
      parent_id: null,
    });
  });

  // Open existing account for edit
  act(() =>
    result.current.open({
      id: "acc-1",
      code: "11",
      name: "بانک",
      nature: "debit",
      active: true,
      version: 1,
    }),
  );
  expect(result.current.editing?.id).toBe("acc-1");
  expect(result.current.value.nature).toBe("debit");

  // Change nature to floating and save
  act(() => result.current.change({ nature: "floating", level: "group" }));
  act(() => result.current.save());
  await waitFor(() => {
    const patchCall = vi
      .mocked(api)
      .mock.calls.find(
        ([path, opts]) =>
          path.includes("accounting/accounts/acc-1") && opts?.method === "PATCH",
      );
    expect(patchCall).toBeTruthy();
    expect(patchCall?.[1]?.body).toEqual({
      code: "11",
      name: "بانک",
      nature: "floating",
      active: true,
      level: "group",
      parent_id: null,
    });
  });
});


it("preserves source account codes through the chart import workflow", async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.endsWith("chart-preview")) return { preview_id: "preview-source-code" };
    return { items: [] };
  });
  const { result } = renderHook(useLedgerAccounts);
  await act(async () => result.current.importFromExcel({
    headers: ["کد حساب", "نام حساب", "ماهیت"],
    rows: [["001205", "حساب واردشده", "بستانکار"]],
    totalRows: 1,
  }));
  expect(api).toHaveBeenCalledWith(
    "/companies/company-a/accounting/setup/chart-preview",
    {
      method: "POST",
      body: { rows: [{ code: "001205", name: "حساب واردشده", nature: "credit", active: true }] },
    },
  );
  expect(api).toHaveBeenCalledWith(
    "/companies/company-a/accounting/setup/chart-import",
    { method: "POST", body: { preview_id: "preview-source-code" } },
  );
  expect(vi.mocked(api).mock.calls.some(([path, options]) =>
    path.endsWith("accounting/accounts") && options?.method === "POST",
  )).toBe(false);
});
