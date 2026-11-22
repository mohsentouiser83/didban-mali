import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Shell } from "./shell";

let mockPathname = "/accounting";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/hooks/workspace", () => ({
  useWorkspace: () => ({
    loading: false,
    user: { id: "u1", name: "کاربر آزمایشی", installation_admin: false },
    company: { id: "c1", name: "شرکت اول", role: "owner" },
    companies: [{ id: "c1", name: "شرکت اول", role: "owner" }],
    periods: [{ id: "p1", name: "دوره مالی ۱۴۰۴" }],
    periodId: "p1",
    setCompany: vi.fn(),
    setPeriodId: vi.fn(),
    logout: vi.fn(),
    error: null,
  }),
}));

vi.mock("./settings-menu", () => ({
  SettingsMenu: () => <div data-testid="settings-menu" />,
}));
vi.mock("./notifications-menu", () => ({
  NotificationsMenu: () => <div data-testid="notifications-menu" />,
}));
vi.mock("./header-account-menu", () => ({
  HeaderAccountMenu: () => <div data-testid="header-account-menu" />,
}));
vi.mock("./floating-assistant", () => ({
  FloatingAssistant: () => <div data-testid="floating-assistant" />,
}));
vi.mock("./module-gate", () => ({
  ModuleGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete storage[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(storage)) {
      delete storage[key];
    }
  }),
};

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("Sidebar Navigation Collapsible Categories in Shell", () => {
  beforeEach(() => {
    mockPathname = "/accounting";
    localStorageMock.clear();
  });

  it("renders category group headers as expandable buttons", () => {
    render(<Shell><div>محتوای صفحه</div></Shell>);

    const accountingButtons = screen.getAllByRole("button", {
      name: /حسابداری/,
    });
    expect(accountingButtons.length).toBeGreaterThan(0);

    const desktopButton = accountingButtons[0];
    expect(desktopButton).toHaveAttribute("aria-expanded", "true");
    expect(desktopButton).toHaveAttribute("aria-controls");
  });

  it("renders dashboard as a standalone link and not a category button", () => {
    render(<Shell><div>محتوای صفحه</div></Shell>);

    const dashboardLink = screen.getAllByRole("link", {
      name: "داشبورد",
    })[0];
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink).toHaveAttribute("href", "/");

    // Dashboard should not be a collapsible category button
    const dashboardButtons = screen.queryAllByRole("button", {
      name: /داشبورد/,
    });
    expect(dashboardButtons.length).toBe(0);
  });

  it("toggles group collapse and expand when header button is clicked", () => {
    render(<Shell><div>محتوای صفحه</div></Shell>);

    const desktopButton = screen.getAllByRole("button", {
      name: /حسابداری/,
    })[0];
    expect(desktopButton).toHaveAttribute("aria-expanded", "true");

    // Click to collapse
    fireEvent.click(desktopButton);
    expect(desktopButton).toHaveAttribute("aria-expanded", "false");

    // Click to expand again
    fireEvent.click(desktopButton);
    expect(desktopButton).toHaveAttribute("aria-expanded", "true");
  });

  it("shows active indicator when a collapsed category contains the current page", () => {
    mockPathname = "/accounting/journals";
    render(<Shell><div>محتوای اسناد</div></Shell>);

    const accountingButton = screen.getAllByRole("button", {
      name: /حسابداری/,
    })[0];

    // Click to collapse the active category
    fireEvent.click(accountingButton);
    expect(accountingButton).toHaveAttribute("aria-expanded", "false");

    // Indicator dot for active page inside collapsed group
    expect(screen.getAllByTitle("شامل صفحه فعال").length).toBeGreaterThan(0);
  });

  it("renders the financial period selector next to company name in header", () => {
    render(<Shell><div>محتوای صفحه</div></Shell>);
    const periodCombobox = screen.getByRole("combobox", { name: "دوره مالی" });
    expect(periodCombobox).toBeInTheDocument();
    expect(periodCombobox).not.toHaveClass("border-transparent");
    expect(periodCombobox).toHaveClass("border-border");
    expect(screen.getByText("دوره مالی ۱۴۰۴")).toBeInTheDocument();
  });

  it("opens the inventory subsection on direct entry and marks its child", () => {
    mockPathname = "/accounting/inventory/items";
    localStorageMock.setItem("didban_sidebar_collapsed_groups", JSON.stringify({ حسابداری: true }));
    localStorageMock.setItem("didban_sidebar_collapsed_subgroups", JSON.stringify({ انبار: true }));
    render(<Shell><div>محتوای کالاها</div></Shell>);

    const inventory = screen.getByRole("button", { name: /^انبار -/ });
    expect(inventory).toHaveAttribute("aria-expanded", "true");
    const current = screen.getByRole("link", { name: "کالاها و خدمات" });
    expect(current).toHaveAttribute("href", "/accounting/inventory/items");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "موجودی و کاردکس" })).not.toHaveAttribute("aria-current");
  });

  it("provides separate cashflow links in mobile navigation with unique disclosure ids", () => {
    mockPathname = "/cashflow/forecast";
    render(<Shell><div>پیش‌بینی</div></Shell>);

    const desktop = screen.getByRole("button", { name: /^نقدینگی -/ });
    fireEvent.click(screen.getByRole("button", { name: "بازکردن ناوبری" }));
    const mobile = screen.getByRole("button", { name: /^نقدینگی -/ });
    expect(mobile.getAttribute("aria-controls")).not.toBe(desktop.getAttribute("aria-controls"));
    expect(screen.getByRole("link", { name: "جریان نقد دوره" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "پیش‌بینی ۳۰روزه" })).toHaveAttribute("aria-current", "page");
  });
});
