import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MembersList } from "./members-list";

describe("MembersList", () => {
  const baseMemberManagement = {
    members: { loading: false, error: null, refresh: vi.fn() },
    permissions: { loading: false, error: null, refresh: vi.fn() },
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

  it("renders the members with column filters", () => {
    render(<MembersList c={baseMemberManagement} />);

    expect(screen.getByRole("button", { name: "فیلتر ستون عضو" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("جستجوی نام یا ایمیل عضو...")).not.toBeInTheDocument();
    expect(screen.getByText("علی رضایی")).toBeInTheDocument();
    expect(screen.getByText("سارا محمدی")).toBeInTheDocument();
  });

  it("combines column filters and clears them independently", () => {
    render(<MembersList c={baseMemberManagement} />);

    function filter(title: string, text: string) {
      fireEvent.click(screen.getByRole("button", { name: `فیلتر ستون ${title}` }));
      fireEvent.change(screen.getByRole("textbox", { name: "شامل متن" }), { target: { value: text } });
      fireEvent.click(screen.getByRole("button", { name: "اعمال" }));
    }

    filter("عضو", "sara@example.test");
    expect(screen.getByRole("row", { name: /سارا محمدی/ })).toBeVisible();
    expect(screen.queryByRole("row", { name: /علی رضایی/ })).not.toBeInTheDocument();

    filter("نقش", "مالک");
    expect(screen.getByText("ردیفی با این فیلترها پیدا نشد")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "فیلتر ستون نقش" }));
    fireEvent.click(screen.getByRole("button", { name: "پاک‌کردن" }));
    expect(screen.getByRole("row", { name: /سارا محمدی/ })).toBeVisible();
    expect(screen.queryByRole("row", { name: /علی رضایی/ })).not.toBeInTheDocument();
  });

  it("renders a dedicated empty state when the company has no members", () => {
    render(<MembersList c={{ ...baseMemberManagement, rows: [], totalMembers: 0 }} />);

    expect(screen.getByText("هنوز عضوی در این شرکت ثبت نشده است")).toBeInTheDocument();
  });

  it("calls openMember when selecting manage access from the row menu", async () => {
    const openMember = vi.fn();
    render(
      <MembersList
        c={{
          ...baseMemberManagement,
          openMember,
        }}
      />,
    );

    const trigger = screen.getByRole("button", { name: `عملیات ${baseMemberManagement.rows[0].name}` });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "مدیریت دسترسی" }));

    expect(openMember).toHaveBeenCalledWith(baseMemberManagement.rows[0]);
  });
});
