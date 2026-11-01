import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeaderAccountMenu } from "./header-account-menu";

describe("HeaderAccountMenu", () => {
  it("shows the account and invokes logout only after selecting it", () => {
    const logout = vi.fn();
    render(<HeaderAccountMenu name="کاربر آزمایشی" onLogout={logout} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "حساب کاربری" }), { key: "ArrowDown" });
    expect(screen.getByText("کاربر آزمایشی")).toBeVisible();
    expect(logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "خروج از حساب" }));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
