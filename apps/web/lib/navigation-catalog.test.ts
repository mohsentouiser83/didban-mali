import { expect, it } from "vitest";
import { isCurrentNavItem, isItemOrChildActive, navigationDestinations, navigationGroups } from "./navigation-catalog";
import { builtInReports } from "./report-archive-catalog";

it("keeps the dashboard and two groups with nine top-level entries", () => {
  expect(navigationGroups.map((group) => group.label)).toEqual([undefined, "حسابداری", "گزارش‌ها"]);
  expect(navigationGroups.flatMap((group) => group.items).map((item) => item.label)).toEqual([
    "داشبورد", "اسناد حسابداری", "خرید و فروش", "دریافت و پرداخت",
    "انبار", "حقوق و دستمزد", "مؤدیان", "گزارش‌ها", "نقدینگی",
  ]);
  expect(navigationGroups[1].items[1].children?.map((item) => item.href)).toEqual([
    "/receivables", "/payables", "/commercial/proformas", "/reconciliation/counterparties",
  ]);
  expect(navigationGroups[1].items[2].children?.map((item) => item.href)).toEqual([
    "/settlements", "/settlements/cheques", "/reconciliation",
  ]);
});

it("keeps settings, documents and assistant out of the sidebar", () => {
  expect(navigationDestinations.map((item) => item.href)).not.toContain("/settings");
  expect(navigationDestinations.map((item) => item.href)).not.toContain("/accounting/operations");
  for (const path of ["/settings/periods", "/settings/documents", "/sources", "/assistant", "/commercial/counterparties"]) {
    expect(navigationDestinations.some((item) => isCurrentNavItem(item.href, path))).toBe(false);
  }
});

it("selects just one destination for nested routes and contextual pages", () => {
  for (const [pathname, destination] of [
    ["/accounting/journals", "/reports"],
    ["/accounting/electronic-ledgers", "/accounting/electronic-ledgers"],
    ["/accounting/operations", "/accounting"],
    ["/accounting/inventory/items", "/accounting/inventory/items"],
    ["/settlements/cheques", "/settlements/cheques"],
    ["/receivables/", "/receivables"],
    ["/commercial/proformas", "/commercial/proformas"],
    ["/payroll/contracts", "/payroll/contracts"],
    ["/moadian/transmissions", "/moadian/transmissions"],
    ["/reconciliation/moadian", "/reconciliation/moadian"],
    ["/reconciliation/bank", "/reconciliation"],
    ["/reconciliation/counterparty", "/reconciliation/counterparties"],
    ["/reports/studio", "/reports"],
    ...builtInReports.map(({ href }) => [href, "/reports"]),
    ["/cashflow/forecast", "/cashflow/forecast"],
    ["/cashflow/scenarios", "/cashflow/scenarios"],
  ]) {
    expect(navigationDestinations.filter((item) => isCurrentNavItem(item.href, pathname)).map((item) => item.href))
      .toEqual([destination]);
  }
  expect(isItemOrChildActive(navigationGroups[1].items[5], "/reconciliation/moadian")).toBe(true);
  expect(isCurrentNavItem("/reports", "/reports-other")).toBe(false);
  expect(navigationGroups[1].items[4].children?.map(({ href }) => href)).toEqual(["/payroll/employees", "/payroll/contracts", "/payroll"]);
  expect(navigationGroups[1].items[4].children?.map(({ label }) => label)).toEqual(["کارمندان", "قرارداد", "لیست حقوق و فیش‌ها"]);
  expect(isItemOrChildActive(navigationGroups[1].items[4], "/payroll/contracts")).toBe(true);
  expect(isItemOrChildActive(navigationGroups[1].items[4], "/employee-reports")).toBe(false);
  expect(isItemOrChildActive(navigationGroups[2].items[0], "/employee-reports")).toBe(true);
});

it("exposes built-in reports through the archive without individual sidebar links", () => {
  expect(navigationDestinations.find(({ href }) => href === "/reports")?.label).toBe("گزارش‌ها");
  expect(navigationGroups[2].items[0].children).toBeUndefined();
  expect(navigationDestinations.map(({ href }) => href)).not.toContain("/reports/companies");
  expect(navigationDestinations.map(({ href }) => href)).not.toContain("/reports/consolidation");
  for (const { href } of builtInReports) {
    expect(navigationDestinations.some((item) => item.href === href)).toBe(false);
  }
});
