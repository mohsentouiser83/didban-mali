import { expect, it } from "vitest";
import {
  isCurrentNavItem,
  isItemOrChildActive,
  navigationGroups,
} from "./navigation-catalog";

it("structures navigation into three clear modules: dashboard, accounting, and reports", () => {
  expect(navigationGroups.map((g) => g.label)).toEqual([
    "داشبورد",
    "حسابداری",
    "گزارش‌ها",
  ]);

  const dashboardGroup = navigationGroups.find((g) => g.label === "داشبورد");
  expect(dashboardGroup).toBeDefined();
  expect(dashboardGroup?.items.map((i) => i.href)).toEqual(["/"]);

  const accountingGroup = navigationGroups.find((g) => g.label === "حسابداری");
  expect(accountingGroup).toBeDefined();
  expect(accountingGroup?.items.map((i) => i.href)).toEqual([
    "/accounting",
    "/settlements",
    "/reconciliation",
    "/accounting/inventory",
    "/payroll",
    "/moadian",
  ]);

  const reconciliationItem = accountingGroup?.items.find(
    (i) => i.href === "/reconciliation",
  );
  expect(reconciliationItem).toBeDefined();
  expect(reconciliationItem?.label).toBe("تطبیق و مغایرت‌گیری");
  expect(reconciliationItem?.children).toBeDefined();
  expect(reconciliationItem?.children?.map((c) => c.href)).toEqual([
    "/reconciliation",
    "/reconciliation/counterparties",
    "/reconciliation/moadian",
  ]);
  expect(reconciliationItem?.children?.map((c) => c.label)).toEqual([
    "تطبیق بانک و دفتر",
    "تطبیق طرف‌حساب‌ها",
    "تطبیق کارپوشه مؤدیان",
  ]);

  const inventoryItem = accountingGroup?.items.find(
    (i) => i.href === "/accounting/inventory",
  );
  expect(inventoryItem).toBeDefined();
  expect(inventoryItem?.label).toBe("انبار");
  expect(inventoryItem?.children).toBeDefined();
  expect(inventoryItem?.children?.map((c) => c.href)).toEqual([
    "/accounting/inventory",
    "/accounting/inventory/items",
    "/accounting/inventory/warehouses",
  ]);
  expect(inventoryItem?.children?.map((c) => c.label)).toEqual([
    "موجودی و کاردکس",
    "کالاها",
    "انبارها",
  ]);

  const reportsGroup = navigationGroups.find((g) => g.label === "گزارش‌ها");
  expect(reportsGroup).toBeDefined();
  expect(reportsGroup?.items.map((i) => i.href)).toEqual([
    "/reports",
    "/reports/studio",
    "/cashflow",
  ]);
});

it("excludes standalone assistant, sources, review, receivables and payables from root sidebar items", () => {
  const allHrefs = navigationGroups.flatMap((g) => g.items.map((i) => i.href));
  expect(allHrefs).not.toContain("/assistant");
  expect(allHrefs).not.toContain("/sources");
  expect(allHrefs).not.toContain("/review");
  expect(allHrefs).not.toContain("/receivables");
  expect(allHrefs).not.toContain("/payables");
  expect(allHrefs).not.toContain("/uploads");
  expect(allHrefs).not.toContain("/settings/accounts");
});

it("matches active navigation paths and subroutes correctly", () => {
  expect(isCurrentNavItem("/accounting", "/accounting")).toBe(true);
  expect(isCurrentNavItem("/accounting", "/accounting/journals")).toBe(true);
  expect(isCurrentNavItem("/accounting", "/accounting/operations")).toBe(true);
  expect(isCurrentNavItem("/accounting", "/accounting/period-end")).toBe(true);
  expect(isCurrentNavItem("/accounting", "/review")).toBe(false);

  expect(isCurrentNavItem("/settlements", "/settlements/cheques")).toBe(true);
  expect(isCurrentNavItem("/settlements", "/receivables")).toBe(true);
  expect(isCurrentNavItem("/settlements", "/payables")).toBe(true);

  expect(isCurrentNavItem("/accounting/inventory", "/accounting/inventory")).toBe(true);
  expect(isCurrentNavItem("/accounting/inventory", "/accounting/inventory/items")).toBe(false);
  expect(isCurrentNavItem("/accounting/inventory/items", "/accounting/inventory/items")).toBe(true);
  expect(isCurrentNavItem("/accounting/inventory/warehouses", "/accounting/inventory/warehouses")).toBe(true);

  const accountingGroup = navigationGroups.find((g) => g.label === "حسابداری");
  const reconciliationItem = accountingGroup?.items.find(
    (i) => i.href === "/reconciliation",
  );
  expect(reconciliationItem).toBeDefined();
  expect(reconciliationItem?.label).toBe("تطبیق و مغایرت‌گیری");
  expect(reconciliationItem?.children).toBeDefined();

  expect(isCurrentNavItem("/reconciliation", "/reconciliation")).toBe(true);
  expect(isCurrentNavItem("/reconciliation", "/reconciliation/bank")).toBe(true);
  expect(isCurrentNavItem("/reconciliation", "/reconciliation/counterparties")).toBe(false);
  expect(isCurrentNavItem("/reconciliation/counterparties", "/reconciliation/counterparties")).toBe(true);
  expect(isCurrentNavItem("/reconciliation/moadian", "/reconciliation/moadian")).toBe(true);

  expect(isItemOrChildActive(reconciliationItem!, "/reconciliation")).toBe(true);
  expect(isItemOrChildActive(reconciliationItem!, "/reconciliation/bank")).toBe(true);
  expect(isItemOrChildActive(reconciliationItem!, "/reconciliation/counterparties")).toBe(true);
  expect(isItemOrChildActive(reconciliationItem!, "/reconciliation/moadian")).toBe(true);
  expect(isItemOrChildActive(reconciliationItem!, "/accounting/journals")).toBe(false);

  const inventoryItem = accountingGroup?.items.find((i) => i.href === "/accounting/inventory");
  expect(isItemOrChildActive(inventoryItem!, "/accounting/inventory")).toBe(true);
  expect(isItemOrChildActive(inventoryItem!, "/accounting/inventory/items")).toBe(true);
  expect(isItemOrChildActive(inventoryItem!, "/accounting/inventory/warehouses")).toBe(true);
  expect(isItemOrChildActive(inventoryItem!, "/accounting/journals")).toBe(false);

  expect(isCurrentNavItem("/moadian", "/moadian/transmissions")).toBe(true);
  expect(isCurrentNavItem("/reports/studio", "/reports/studio")).toBe(true);
  expect(isCurrentNavItem("/reports/builder", "/reports/builder")).toBe(true);
  expect(isCurrentNavItem("/reports", "/reports/native")).toBe(true);
  expect(isCurrentNavItem("/reports", "/employee-reports")).toBe(false);
  expect(isCurrentNavItem("/payroll", "/employee-reports")).toBe(true);
});

