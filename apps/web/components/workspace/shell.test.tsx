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

  it("toggles group collapse and expand when header button is clicked", () => {
    render(<Shell><div>محتوای صفحه</div></Shell>);

    const desktopButton = screen.getAllByRole("button", {
      name: /داشبورد/,
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

  it("renders inventory as a collapsible subcategory under accounting with sub-items", () => {
    mockPathname = "/accounting/inventory/items";
    render(<Shell><div>محتوای کالاها</div></Shell>);

    const inventoryCategoryButtons = screen.getAllByRole("button", {
      name: /انبار/,
    });
    expect(inventoryCategoryButtons.length).toBeGreaterThan(0);
    const inventoryButton = inventoryCategoryButtons[0];
    expect(inventoryButton).toHaveAttribute("aria-expanded", "true");

    // Check inventory sub-items
    const itemsLink = screen.getAllByRole("link", { name: "کالاها" })[0];
    expect(itemsLink).toBeInTheDocument();
    expect(itemsLink).toHaveAttribute("href", "/accounting/inventory/items");
    expect(itemsLink).toHaveAttribute("aria-current", "page");

    const stockLink = screen.getAllByRole("link", { name: "موجودی و کاردکس" })[0];
    expect(stockLink).toBeInTheDocument();
    expect(stockLink).toHaveAttribute("href", "/accounting/inventory");
    expect(stockLink).not.toHaveAttribute("aria-current");

    const warehousesLink = screen.getAllByRole("link", { name: "انبارها" })[0];
    expect(warehousesLink).toBeInTheDocument();
    expect(warehousesLink).toHaveAttribute("href", "/accounting/inventory/warehouses");
    expect(warehousesLink).not.toHaveAttribute("aria-current");

    // Click to collapse inventory subcategory
    fireEvent.click(inventoryButton);
    expect(inventoryButton).toHaveAttribute("aria-expanded", "false");
  });
});
