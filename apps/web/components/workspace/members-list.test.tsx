import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MembersList } from "./members-list";

describe("MembersList", () => {
  const baseMemberManagement = {
    members: { loading: false, error: null, refresh: vi.fn() },
    permissions: { loading: false, error: null, refresh: vi.fn() },
    query: "",
    setQuery: vi.fn(),
    roleFilter: "all",
    setRoleFilter: vi.fn(),
    statusFilter: "all",
    setStatusFilter: vi.fn(),
    hasActiveFilters: false,
    resetFilters: vi.fn(),
    totalMembers: 2,
    rows: [
      {
        id: "m1",
        user_id: "u1",
        name: "علی رضایی",
        email: "ali@example.test",
        role: "owner",
        roleLabel: "مالک",
        active: true,
        approve_financial_report: true,
        version: 1,
      },
      {
        id: "m2",
        user_id: "u2",
        name: "سارا محمدی",
        email: "sara@example.test",
        role: "advisor",
        roleLabel: "مشاور / حسابدار",
        active: false,
        approve_financial_report: false,
        version: 1,
      },
    ],
    openMember: vi.fn(),
  } as unknown as Parameters<typeof MembersList>[0]["c"];

  it("renders members table and search toolbar", () => {
    render(<MembersList c={baseMemberManagement} />);

    expect(screen.getByPlaceholderText("جستجوی نام یا ایمیل عضو...")).toBeInTheDocument();
    expect(screen.getByText("علی رضایی")).toBeInTheDocument();
    expect(screen.getByText("سارا محمدی")).toBeInTheDocument();
    expect(screen.getByText("۲ عضو")).toBeInTheDocument();
  });

  it("handles search input change", () => {
    const setQuery = vi.fn();
    render(
      <MembersList
        c={{
          ...baseMemberManagement,
          setQuery,
        }}
      />,
    );

    const input = screen.getByPlaceholderText("جستجوی نام یا ایمیل عضو...");
    fireEvent.change(input, { target: { value: "سارا" } });

    expect(setQuery).toHaveBeenCalledWith("سارا");
  });

  it("renders clear filters button when filters are active", () => {
    const resetFilters = vi.fn();
    render(
      <MembersList
        c={{
          ...baseMemberManagement,
          query: "سارا",
          hasActiveFilters: true,
          totalMembers: 2,
          rows: [baseMemberManagement.rows[1]],
          resetFilters,
        }}
      />,
    );

    expect(screen.getByText("۱ از ۲ عضو")).toBeInTheDocument();
    const clearBtn = screen.getByRole("button", { name: "پاک‌کردن فیلترها" });
    fireEvent.click(clearBtn);

    expect(resetFilters).toHaveBeenCalled();
  });

  it("renders empty state when no members match", () => {
    render(
      <MembersList
        c={{
          ...baseMemberManagement,
          rows: [],
          hasActiveFilters: true,
        }}
      />,
    );

    expect(screen.getByText("عضوی با این مشخصات پیدا نشد")).toBeInTheDocument();
  });

  it("calls openMember when clicking manage access button", () => {
    const openMember = vi.fn();
    render(
      <MembersList
        c={{
          ...baseMemberManagement,
          openMember,
        }}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: "مدیریت دسترسی" });
    fireEvent.click(buttons[0]);

    expect(openMember).toHaveBeenCalledWith(baseMemberManagement.rows[0]);
  });
});
