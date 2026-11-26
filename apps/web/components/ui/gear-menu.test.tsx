import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GearMenu } from "./gear-menu";
import { settingsCatalog } from "@/lib/settings-catalog";
import { BankIcon } from "@phosphor-icons/react";

describe("GearMenu", () => {
  it("renders categories initially in the gear menu", () => {
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

    const categoriesNav = screen.getByRole("navigation", {
      name: "دسته‌بندی‌های تنظیمات",
    });
    expect(categoriesNav).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /تعاریف مالی و حسابداری/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /کارمندان و پرسنل/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /شرکت و دسترسی/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /^فایل‌ها و مدارک/ })).toHaveAttribute("href", "/settings/documents");
    expect(screen.queryByRole("button", { name: /میز کار تطبیق و مغایرت/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /انبار و کالا/ })).not.toBeInTheDocument();
  });

  it("entering a category reveals cards for that category and allows navigation", () => {
    const onNavigate = vi.fn();

    render(
      <GearMenu
        open={true}
        onOpenChange={vi.fn()}
        pathname="/dashboard"
        onNavigate={onNavigate}
        categories={settingsCatalog}
      />,
    );

    const accountingBtn = screen.getByRole("button", { name: /تعاریف مالی و حسابداری/ });
    fireEvent.click(accountingBtn);

    const cardsNav = screen.getByRole("navigation", {
      name: "تعاریف مالی و حسابداری",
    });
    expect(cardsNav).toBeInTheDocument();

    const accountsLink = screen.getByRole("link", { name: /کدینگ حساب‌ها/ });
    expect(accountsLink).toBeVisible();
    expect(accountsLink).toHaveAttribute("href", "/settings/accounts");

    const counterpartiesLink = screen.getByRole("link", { name: /طرف‌حساب‌ها/ });
    expect(counterpartiesLink).toBeVisible();
    expect(counterpartiesLink).toHaveAttribute("href", "/commercial/counterparties");

    const periodsLink = screen.getByRole("link", { name: /دوره‌های مالی/ });
    expect(periodsLink).toBeVisible();
    expect(periodsLink).toHaveAttribute("href", "/settings/periods");

    const dimensionsLink = screen.getByRole("link", { name: /پروژه، شعبه و مرکز هزینه/ });
    expect(dimensionsLink).toBeVisible();
    expect(dimensionsLink).toHaveAttribute("href", "/settings/dimensions");

    const numberingLink = screen.getByRole("link", { name: /شماره‌گذاری/ });
    expect(numberingLink).toBeVisible();
    expect(numberingLink).toHaveAttribute("href", "/settings/numbering");

    fireEvent.click(accountsLink);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("back button returns from category cards view to categories view", () => {
    render(
      <GearMenu
        open={true}
        onOpenChange={vi.fn()}
        pathname="/dashboard"
        onNavigate={vi.fn()}
        categories={settingsCatalog}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /شرکت و دسترسی/ }));

    expect(
      screen.getByRole("navigation", { name: "شرکت و دسترسی" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /دسترسی و کاربران/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /اطلاعات شرکت/ })).toBeVisible();

    const backBtn = screen.getByRole("button", { name: /بازگشت به دسته‌بندی‌ها/ });
    fireEvent.click(backBtn);

    expect(
      screen.getByRole("navigation", { name: "دسته‌بندی‌های تنظیمات" }),
    ).toBeInTheDocument();
  });

  it("marks the active route correctly inside category cards", () => {
    render(
      <GearMenu
        open={true}
        onOpenChange={vi.fn()}
        pathname="/settings/accounts"
        onNavigate={vi.fn()}
        categories={settingsCatalog}
      />,
    );

    // Enter accounting category
    fireEvent.click(screen.getByRole("button", { name: /تعاریف مالی و حسابداری/ }));

    const accountsLink = screen.getByRole("link", { name: /کدینگ حساب‌ها/ });
    expect(accountsLink).toHaveAttribute("aria-current", "page");

    const periodsLink = screen.getByRole("link", { name: /دوره‌های مالی/ });
    expect(periodsLink).not.toHaveAttribute("aria-current");
  });

  it("displays search results when query is provided", () => {
    const onNavigate = vi.fn();
    const results = [
      {
        key: "reconciliation-bank",
        href: "/reconciliation",
        label: "تطبیق بانک و دفتر",
        categoryTitle: "میز کار تطبیق و مغایرت",
        icon: BankIcon,
      },
    ];

    render(
      <GearMenu
        open={true}
        onOpenChange={vi.fn()}
        pathname="/dashboard"
        onNavigate={onNavigate}
        categories={settingsCatalog}
        query="تطبیق"
        onQueryChange={vi.fn()}
        results={results}
      />,
    );

    const searchNav = screen.getByRole("navigation", { name: "نتایج جستجو" });
    expect(searchNav).toBeInTheDocument();

    const resultLink = screen.getByRole("link", { name: /تطبیق بانک و دفتر/ });
    expect(resultLink).toBeVisible();
    expect(resultLink).toHaveAttribute("href", "/reconciliation");

    fireEvent.click(resultLink);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
