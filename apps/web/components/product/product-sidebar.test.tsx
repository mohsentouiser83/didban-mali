import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProductSidebar } from "./product-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { WalletCards } from "@/components/ui/icons";
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
afterEach(() => vi.restoreAllMocks());
it("moves the same indicator between active pages", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const href = this.getAttribute("href");
      if (href)
        return new DOMRect(
          12,
          href.endsWith("payables") ? 120 : href.endsWith("profile") ? 600 : 72,
          199,
          44,
        );
      return new DOMRect(0, 0, 223, 800);
    },
  );
  const view = (active: string) => (
    <SidebarProvider>
      <ProductSidebar
        groups={[
          {
            items: [
              { href: "/cashflow", label: "نقدینگی", icon: WalletCards },
              { href: "/payables", label: "بدهی‌ها", icon: WalletCards },
            ],
          },
        ]}
        userName="مدیر"
        base="/company"
        isItemActive={(href) => href === active}
        onLogout={vi.fn()}
        onSupport={vi.fn()}
      />
    </SidebarProvider>
  );
  const { container, rerender } = render(view("/cashflow"));
  const indicator = container.querySelector(".sidebar-selection");
  expect(indicator).toHaveStyle({ transform: "translate3d(12px, 72px, 0)" });
  rerender(view("/payables"));
  expect(container.querySelector(".sidebar-selection")).toBe(indicator);
  expect(indicator).toHaveStyle({ transform: "translate3d(12px, 120px, 0)" });
  expect(screen.getByRole("link", { name: "بدهی‌ها" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.queryByRole("link", { name: "تنظیمات شرکت" })).not.toBeInTheDocument();
});
