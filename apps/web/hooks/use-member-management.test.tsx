import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { useMemberManagement } from "./use-member-management";
const state = vi.hoisted(() => ({ version: 4 }));
const member = {
  id: "m",
  user_id: "recipient",
  name: "همکار",
  role: "advisor",
  active: true,
  approve_financial_report: false,
  version: 3,
};
vi.mock("./workspace", () => ({
  useWorkspace: () => ({
    company: { id: "c", role: "owner" },
    user: { installation_admin: true },
    companyPath: (path: string) => `/companies/c/${path}`,
    refreshCompanies: vi.fn(),
  }),
}));
const sampleMembers = [
  {
    id: "m1",
    user_id: "u1",
    name: "علی رضایی",
    email: "ali@example.test",
    role: "owner",
    active: true,
    approve_financial_report: true,
    version: 1,
  },
  {
    id: "m2",
    user_id: "u2",
    name: "سارا محمدی",
    email: "sara@example.test",
    role: "finance_manager",
    active: true,
    approve_financial_report: false,
    version: 1,
  },
  {
    id: "m3",
    user_id: "u3",
    name: "امیر حسینی",
    email: "amir@example.test",
    role: "advisor",
    active: false,
    approve_financial_report: false,
    version: 1,
  },
];

const sampleUsers = [
  { id: "u1", name: "علی رضایی", email: "ali@example.test" },
  { id: "u2", name: "سارا محمدی", email: "sara@example.test" },
  { id: "u-new", name: "کاربر جدید", email: "newuser@example.test" },
];

vi.mock("./use-resource", () => ({
  useResource: (path: string) => ({
    data: {
      items: path.endsWith("/permissions")
        ? [
            {
              membership_id: "m",
              role: "advisor",
              version: state.version,
              post_journal: false,
              reopen_period: false,
              view_payroll: false,
              implicit_authority: false,
            },
          ]
        : path.endsWith("/members")
          ? sampleMembers
          : path === "/admin/users"
            ? sampleUsers
            : [],
    },
    refresh: vi.fn(),
    loading: false,
  }),
}));
vi.mock("@/components/ui/sonner", () => ({ notify: { success: vi.fn() } }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(api).mockReset();
  state.version = 4;
});
it("stages role and permission edits without writing until explicit save", async () => {
  const { result, rerender } = renderHook(useMemberManagement);
  act(() => result.current.openMember(member));
  act(() =>
    result.current.setAccessValue({
      post_journal: true,
      reopen_period: false,
      view_payroll: true,
    }),
  );
  expect(api).not.toHaveBeenCalled();
  state.version = 5;
  rerender();
  vi.mocked(api).mockResolvedValue({});
  await act(async () => result.current.saveAccess());
  expect(api).toHaveBeenCalledWith(
    "/companies/c/accounting/permissions/m",
    expect.objectContaining({
      version: 4,
      body: { post_journal: true, reopen_period: false, view_payroll: true },
    }),
  );
});
it("requires membership changes to be saved before accounting grants", () => {
  const { result } = renderHook(useMemberManagement);
  act(() => result.current.openMember(member));
  act(() => result.current.setRole("owner"));
  act(() => result.current.saveAccess());
  expect(api).not.toHaveBeenCalled();
  expect(result.current.value.approve_financial_report).toBe(false);
});
it("retries a failed company membership without creating the account twice", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce({ id: "created-user" })
    .mockRejectedValueOnce(new ApiError(409, "عضویت انجام نشد", "conflict"))
    .mockResolvedValueOnce({ id: "membership" });
  const { result } = renderHook(useMemberManagement);
  act(() => {
    result.current.openAdd();
    result.current.setMethod("new");
  });
  act(() =>
    result.current.setAccount({
      name: "همکار",
      email: "new@example.test",
      password: "Synthetic-only-password",
    }),
  );
  await act(async () => result.current.add());
  expect(result.current.adding).toBe(true);
  expect(result.current.userId).toBe("created-user");
  expect(result.current.account.password).toBe("");
  await act(async () => result.current.add());
  expect(
    vi.mocked(api).mock.calls.filter(([path]) => path === "/admin/users"),
  ).toHaveLength(1);
  expect(
    vi
      .mocked(api)
      .mock.calls.filter(([path]) => path === "/companies/c/members"),
  ).toHaveLength(2);
  expect(result.current.adding).toBe(false);
});

it("filters members by search query, role, and status and allows resetting", () => {
  const { result } = renderHook(useMemberManagement);

  expect(result.current.totalMembers).toBe(3);
  expect(result.current.rows).toHaveLength(3);
  expect(result.current.hasActiveFilters).toBe(false);

  // Search by name
  act(() => result.current.setQuery("سارا"));
  expect(result.current.rows).toHaveLength(1);
  expect(result.current.rows[0].name).toBe("سارا محمدی");
  expect(result.current.hasActiveFilters).toBe(true);

  // Clear query and filter by role
  act(() => {
    result.current.setQuery("");
    result.current.setRoleFilter("advisor");
  });
  expect(result.current.rows).toHaveLength(1);
  expect(result.current.rows[0].role).toBe("advisor");

  // Filter by status
  act(() => {
    result.current.setRoleFilter("all");
    result.current.setStatusFilter("active");
  });
  expect(result.current.rows).toHaveLength(2);

  // Reset all filters
  act(() => result.current.resetFilters());
  expect(result.current.rows).toHaveLength(3);
  expect(result.current.hasActiveFilters).toBe(false);
});

it("filters available user options when searching for existing users in add drawer", () => {
  const { result } = renderHook(useMemberManagement);

  expect(result.current.userOptions).toHaveLength(3);

  act(() => result.current.setUserSearchQuery("جدید"));
  expect(result.current.filteredUserOptions).toHaveLength(1);
  expect(result.current.filteredUserOptions[0].label).toContain("کاربر جدید");

  act(() => result.current.openAdd());
  expect(result.current.userSearchQuery).toBe("");
  expect(result.current.filteredUserOptions).toHaveLength(3);
});
