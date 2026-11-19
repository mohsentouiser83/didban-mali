import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GearMenu } from "./gear-menu";
import { settingsCatalog } from "@/lib/settings-catalog";

describe("GearMenu", () => {
  it("renders side-by-side grid layout with categories", () => {
    const onNavigate = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <GearMenu
        open={true}
        onOpenChange={onOpenChange}
        pathname="/dashboard"
        onNavigate={onNavigate}
        categories={settingsCatalog}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "تنظیمات" });
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveClass("grid-cols-2");

    const accessLink = screen.getByRole("link", { name: /دسترسی/ });
    expect(accessLink).toBeVisible();
    expect(accessLink).toHaveAttribute("href", "/settings/members");

    const accountsLink = screen.getByRole("link", { name: /کدینگ حساب‌ها/ });
    expect(accountsLink).toBeVisible();
    expect(accountsLink).toHaveAttribute("href", "/settings/accounts");

    const periodsLink = screen.getByRole("link", { name: /دوره‌های مالی/ });
    expect(periodsLink).toBeVisible();
    expect(periodsLink).toHaveAttribute("href", "/settings/periods");

    const dimensionsLink = screen.getByRole("link", { name: /ابعاد مالی/ });
    expect(dimensionsLink).toBeVisible();
    expect(dimensionsLink).toHaveAttribute("href", "/settings/dimensions");

    const numberingLink = screen.getByRole("link", { name: /شماره‌گذاری/ });
    expect(numberingLink).toBeVisible();
    expect(numberingLink).toHaveAttribute("href", "/settings/numbering");

    fireEvent.click(accessLink);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("marks the active route correctly", () => {
    render(
      <GearMenu
        open={true}
        onOpenChange={vi.fn()}
        pathname="/settings/members"
        onNavigate={vi.fn()}
        categories={settingsCatalog}
      />,
    );

    const accessLink = screen.getByRole("link", { name: /دسترسی/ });
    expect(accessLink).toHaveAttribute("aria-current", "page");

    const numberingLink = screen.getByRole("link", { name: /شماره‌گذاری/ });
    expect(numberingLink).not.toHaveAttribute("aria-current");
  });
});
