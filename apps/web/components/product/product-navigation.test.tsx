import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ProductSidebar } from "./product-sidebar";
import { WorkspaceSectionNav } from "./workspace-section-nav";
import { isProductItemActive, productNavigation, productSectionNavigation } from "./product-navigation";

const route = vi.hoisted(() => ({ pathname: "/companies/example/overview" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
const base = "/companies/example";

it.each([
  ["scenarios", "نقدینگی", "سناریوها"],
])("keeps %s reachable within its parent section", (path, parent, selected) => {
  route.pathname = `${base}/${path}`;
  const navigation = productNavigation(base);
  const section = productSectionNavigation(route.pathname, base)!;
  render(<SidebarProvider>
    <ProductSidebar groups={navigation.primary} secondaryGroups={navigation.secondary}
      userName="مدیر" base={base}
      isItemActive={(href) => isProductItemActive(route.pathname, href, base)}
      onLogout={vi.fn()} onSupport={vi.fn()} />
    <WorkspaceSectionNav {...section} />
  </SidebarProvider>);
  const main = within(screen.getByRole("navigation", { name: "ناوبری اصلی" }));
  expect(main.getAllByRole("link")).toHaveLength(6);
  expect(main.getByRole("link", { name: parent })).toHaveAttribute("aria-current", "page");
  const local = within(screen.getByRole("navigation", { name: parent }));
  expect(local.getByRole("link", { name: selected })).toHaveAttribute("aria-current", "page");
  expect(main.getByRole("link", { name: "گزارش‌ها" })).toBeInTheDocument();
  expect(main.queryByRole("link", { name: "ورود داده" })).not.toBeInTheDocument();
});

it("does not highlight another company or a similarly named route", () => {
  expect(isProductItemActive("/companies/other/scenarios", `${base}/cashflow`, base)).toBe(false);
  expect(isProductItemActive(`${base}/findings-archive`, `${base}/findings`, base)).toBe(false);

});


it.each(["findings", "findings/case-1", "actions", "reconciliation"])("keeps review navigation unified on %s", (path) => {
  expect(productSectionNavigation(`${base}/${path}`, base)).toBeNull();
  expect(isProductItemActive(`${base}/${path}`, `${base}/findings`, base)).toBe(true);
});
