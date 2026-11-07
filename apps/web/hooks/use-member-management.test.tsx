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
              implicit_authority: false,
            },
          ]
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
    result.current.setAccessValue({ post_journal: true, reopen_period: false }),
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
      body: { post_journal: true, reopen_period: false },
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
