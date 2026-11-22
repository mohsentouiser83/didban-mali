import { expect, it } from "vitest";
import {
  visibleSettingsCategories,
  searchSettings,
  settingsCategoryDestination,
  isSettingsCategoryActive,
} from "./settings-catalog";

it("shows categorized settings with cards in gear settings catalog", () => {
  const viewer = visibleSettingsCategories({
    hasCompany: true,
    role: "viewer",
    installationAdmin: false,
  });
  expect(viewer.map((c) => c.key)).toEqual([
    "accounting",
    "personnel",
    "company-access",
    "documents",
    "reconciliation",
    "inventory",
  ]);
  expect(
    viewer.flatMap((group) => group.items.map((item) => item.href)),
  ).toEqual([
    "/settings/accounts",
    "/settings/periods",
    "/settings/dimensions",
    "/settings/account-roles",
    "/settings/rules",
    "/settings/learning",
    "/settings/numbering",
    "/settings/employees",
    "/settings/contracts",
    "/settings/members",
    "/settings/company",
    "/settings/modules",
    "/settings/connections",
    "/settings/connections/notifications",
    "/sources",
    "/uploads",
    "/settings/connections/documents",
    "/reconciliation",
    "/reconciliation/counterparties",
    "/reconciliation/moadian",
    "/review",
    "/review/native-controls",
    "/review/expense-changes",
    "/accounting/inventory/items",
    "/accounting/inventory/warehouses",
    "/accounting/inventory",
  ]);
  expect(searchSettings(viewer, "تطبیق")[0].href).toBe("/reconciliation");
  expect(searchSettings(viewer, "طرف‌حساب")[0].href).toBe(
    "/reconciliation/counterparties",
  );
  expect(searchSettings(viewer, "کالا")[0].href).toBe(
    "/accounting/inventory/items",
  );
  expect(searchSettings(viewer, "انبارها")[0].href).toBe(
    "/accounting/inventory/warehouses",
  );
  expect(searchSettings(viewer, "کاردکس")[0].href).toBe(
    "/accounting/inventory",
  );
  expect(searchSettings(viewer, "دسترسی")[0].href).toBe("/settings/members");
  expect(searchSettings(viewer, "اعضا")[0].href).toBe("/settings/members");
  expect(searchSettings(viewer, "کدینگ")[0].href).toBe("/settings/accounts");
  expect(searchSettings(viewer, "حساب‌ها")[0].href).toBe("/settings/accounts");
  expect(searchSettings(viewer, "دوره")[0].href).toBe("/settings/periods");
  expect(searchSettings(viewer, "ابعاد")[0].href).toBe("/settings/dimensions");
  expect(searchSettings(viewer, "شماره‌گذاری")[0].href).toBe(
    "/settings/numbering",
  );
  expect(searchSettings(viewer, "001")[0].href).toBe("/settings/numbering");
  expect(searchSettings(viewer, "تلگرام")[0].href).toBe(
    "/settings/connections",
  );
  expect(searchSettings(viewer, "سازمان")[0].href).toBe("/settings/company");

  expect(
    settingsCategoryDestination(
      viewer.find((category) => category.key === "company-access")!,
    ),
  ).toBe("/settings/company-access");
  expect(
    settingsCategoryDestination(
      viewer.find((category) => category.key === "accounting")!,
    ),
  ).toBe("/settings/accounting");
  expect(
    settingsCategoryDestination(
      viewer.find((category) => category.key === "personnel")!,
    ),
  ).toBe("/settings/personnel");
  expect(
    settingsCategoryDestination(
      viewer.find((category) => category.key === "reconciliation")!,
    ),
  ).toBe("/reconciliation");
  expect(
    settingsCategoryDestination(
      viewer.find((category) => category.key === "inventory")!,
    ),
  ).toBe("/settings/inventory");
});

it("offers no settings to a user without a company", () => {
  const categories = visibleSettingsCategories({
    hasCompany: false,
    installationAdmin: false,
  });
  expect(
    categories.flatMap((group) => group.items.map((item) => item.href)),
  ).toEqual([]);
});

it("checks active state for settings destinations and categories", () => {
  const categories = visibleSettingsCategories({
    hasCompany: true,
    role: "owner",
    installationAdmin: true,
  });
  expect(categories.map((c) => c.key)).toEqual([
    "accounting",
    "personnel",
    "company-access",
    "documents",
    "reconciliation",
    "inventory",
  ]);

  const accounting = categories.find((c) => c.key === "accounting")!;
  expect(isSettingsCategoryActive(accounting, "/settings/accounting")).toBe(true);
  expect(isSettingsCategoryActive(accounting, "/settings/accounts")).toBe(true);
  expect(isSettingsCategoryActive(accounting, "/settings/periods")).toBe(true);
  expect(isSettingsCategoryActive(accounting, "/settings/dimensions")).toBe(true);
  expect(isSettingsCategoryActive(accounting, "/settings/numbering")).toBe(true);
  expect(isSettingsCategoryActive(accounting, "/settings/members")).toBe(false);

  const personnel = categories.find((c) => c.key === "personnel")!;
  expect(isSettingsCategoryActive(personnel, "/settings/employees")).toBe(true);
  expect(isSettingsCategoryActive(personnel, "/settings/contracts")).toBe(true);
  expect(isSettingsCategoryActive(personnel, "/settings/accounts")).toBe(false);

  const reconciliation = categories.find((c) => c.key === "reconciliation")!;
  expect(isSettingsCategoryActive(reconciliation, "/reconciliation")).toBe(true);
  expect(
    isSettingsCategoryActive(
      reconciliation,
      "/reconciliation/counterparties",
    ),
  ).toBe(true);

  const inventory = categories.find((c) => c.key === "inventory")!;
  expect(isSettingsCategoryActive(inventory, "/accounting/inventory/items")).toBe(
    true,
  );
  expect(
    isSettingsCategoryActive(inventory, "/accounting/inventory/warehouses"),
  ).toBe(true);
  expect(isSettingsCategoryActive(inventory, "/accounting/inventory")).toBe(
    true,
  );

  const companyAccess = categories.find((c) => c.key === "company-access")!;
  expect(isSettingsCategoryActive(companyAccess, "/settings/members")).toBe(true);
  expect(isSettingsCategoryActive(companyAccess, "/settings/company")).toBe(true);
  expect(isSettingsCategoryActive(companyAccess, "/settings/connections")).toBe(true);
  expect(isSettingsCategoryActive(companyAccess, "/settings/numbering")).toBe(false);
  expect(isSettingsCategoryActive(companyAccess, "/settings/connections/documents")).toBe(false);
  const documents = categories.find((category) => category.key === "documents")!;
  expect(isSettingsCategoryActive(documents, "/settings/connections/documents")).toBe(true);
  expect(isSettingsCategoryActive(documents, "/uploads/session-id")).toBe(true);
  expect(searchSettings(categories, "در انتظار پاسخ")[0].href).toBe("/uploads");
  expect(searchSettings(categories, "بودجه")[0].href).toBe("/settings/model");
});
