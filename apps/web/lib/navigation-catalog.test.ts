import { expect, it } from "vitest";
import { isCurrentNavItem, isItemOrChildActive, navigationDestinations, navigationGroups } from "./navigation-catalog";

it("keeps the dashboard and two groups with nine top-level entries", () => {
  expect(navigationGroups.map((group) => group.label)).toEqual([undefined, "حسابداری", "گزارش‌ها"]);
  expect(navigationGroups.flatMap((group) => group.items).map((item) => item.label)).toEqual([
    "داشبورد", "اسناد حسابداری", "خرید و فروش", "دریافت و پرداخت",
    "انبار", "حقوق و دستمزد", "مؤدیان", "گزارش‌های مالی", "نقدینگی",
  ]);
  expect(navigationGroups[1].items[1].children?.map((item) => item.href)).toEqual([
    "/receivables", "/payables", "/commercial/proformas", "/commercial/counterparties",
  ]);
  expect(navigationGroups[1].items[2].children?.map((item) => item.href)).toEqual([
    "/settlements", "/settlements/cheques", "/settlements/plans", "/receivables/followups",
  ]);
});

it("leaves settings, reconciliation, sources and assistant in their existing surfaces", () => {
  expect(navigationDestinations.map((item) => item.href)).not.toContain("/settings");
  for (const path of ["/settings/periods", "/reconciliation", "/sources", "/assistant"]) {
    expect(navigationDestinations.some((item) => isCurrentNavItem(item.href, path))).toBe(false);
  }
});

it("selects just one destination for nested routes and contextual pages", () => {
  for (const [pathname, destination] of [
    ["/accounting/journals", "/accounting/journals"],
    ["/accounting/operations", "/accounting/operations"],
    ["/accounting/inventory/items", "/accounting/inventory/items"],
    ["/settlements/cheques", "/settlements/cheques"],
    ["/receivables/followups", "/receivables/followups"],
    ["/receivables/", "/receivables"],
    ["/commercial/proformas", "/commercial/proformas"],
    ["/employee-reports", "/employee-reports"],
    ["/moadian/transmissions", "/moadian/transmissions"],
    ["/reports/studio", "/reports"],
    ["/reports/native", "/reports/native"],
    ["/cashflow", "/cashflow"],
    ["/cashflow/forecast", "/cashflow/forecast"],
    ["/cashflow/scenarios", "/cashflow/scenarios"],
  ]) {
    expect(navigationDestinations.filter((item) => isCurrentNavItem(item.href, pathname)).map((item) => item.href))
      .toEqual([destination]);
  }
  expect(isCurrentNavItem("/reports", "/reports-other")).toBe(false);
  expect(isItemOrChildActive(navigationGroups[1].items[2], "/receivables/followups")).toBe(true);
  expect(isItemOrChildActive(navigationGroups[1].items[1], "/receivables/followups")).toBe(false);
});
