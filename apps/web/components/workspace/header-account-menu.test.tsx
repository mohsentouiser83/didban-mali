import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeaderAccountMenu } from "./header-account-menu";

describe("HeaderAccountMenu", () => {
  it("shows the account, profile link and invokes logout only after selecting it", () => {
    const logout = vi.fn();
    render(<HeaderAccountMenu name="کاربر آزمایشی" onLogout={logout} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "حساب کاربری" }), { key: "ArrowDown" });
    expect(screen.getByText("کاربر آزمایشی")).toBeVisible();
    const profileLink = screen.getByRole("menuitem", { name: "پروفایل کاربری" });
    expect(profileLink).toBeVisible();
    expect(profileLink).toHaveAttribute("href", "/settings/profile");
    expect(logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "خروج از حساب" }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("renders image avatar when provided", () => {
    render(
      <HeaderAccountMenu
        name="کاربر آزمایشی"
        avatar="data:image/png;base64,sample"
        onLogout={vi.fn()}
      />,
    );
    const img = screen.getByRole("img", { name: "کاربر آزمایشی" });
    expect(img).toBeVisible();
    expect(img).toHaveAttribute("src", "data:image/png;base64,sample");
  });
});
