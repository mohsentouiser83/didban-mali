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
    "company-access",
    "documents",
  ]);
  expect(
    viewer.flatMap((group) => group.items.map((item) => item.href)),
  ).toEqual([
    "/settings/accounts",
    "/commercial/counterparties",
    "/settings/periods",
    "/settings/dimensions",
    "/settings/numbering",
    "/settings/members",
    "/settings/company",
    "/settings/documents",
  ]);
  expect(searchSettings(viewer, "مدارک بات")[0].href).toBe("/settings/documents");
  for (const removed of ["کارمندان", "پرسنل", "قرارداد کارمندان", "تطبیق", "مغایرت", "کالا", "انبارها", "کاردکس", "اعلان‌های بات", "موارد نیازمند بررسی", "کنترل‌های دفتر", "تحلیل تغییر هزینه‌ها", "نقش حساب‌ها در صورت‌های مالی", "قواعد و پیشنهادهای حسابداری", "الگوهای ثبت و نگاشت"]) {
    expect(searchSettings(viewer, removed)).toEqual([]);
  }
  expect(searchSettings(viewer, "دسترسی")[0].href).toBe("/settings/members");
  expect(searchSettings(viewer, "اعضا")[0].href).toBe("/settings/members");
  expect(searchSettings(viewer, "کدینگ")[0].href).toBe("/settings/accounts");
  expect(searchSettings(viewer, "حساب‌ها")[0].href).toBe("/settings/accounts");
  expect(searchSettings(viewer, "طرف حساب")[0].href).toBe("/commercial/counterparties");
  expect(searchSettings(viewer, "مشتریان")[0].categoryTitle).toBe("تعاریف مالی و حسابداری");
  expect(searchSettings(viewer, "دوره")[0].href).toBe("/settings/periods");
  expect(searchSettings(viewer, "ابعاد")[0].href).toBe("/settings/dimensions");
  expect(searchSettings(viewer, "شماره‌گذاری")[0].href).toBe(
    "/settings/numbering",
  );
  expect(searchSettings(viewer, "001")[0].href).toBe("/settings/numbering");
  expect(searchSettings(viewer, "تلگرام")).toEqual([]);
  expect(searchSettings(viewer, "پیام‌رسان")).toEqual([]);
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
      viewer.find((category) => category.key === "documents")!,
    ),
  ).toBe("/settings/documents");
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
    "company-access",
    "documents",
  ]);

  const accounting = categories.find((c) => c.key === "accounting")!;
  expect(isSettingsCategoryActive(accounting, "/settings/accounting")).toBe(true);
  expect(isSettingsCategoryActive(accounting, "/settings/accounts")).toBe(true);
  expect(isSettingsCategoryActive(accounting, "/settings/periods")).toBe(true);
  expect(isSettingsCategoryActive(accounting, "/settings/dimensions")).toBe(true);
  expect(isSettingsCategoryActive(accounting, "/settings/numbering")).toBe(true);
  expect(isSettingsCategoryActive(accounting, "/commercial/counterparties")).toBe(true);
  expect(isSettingsCategoryActive(accounting, "/settings/members")).toBe(false);

  expect(categories.some((category) =>
    isSettingsCategoryActive(category, "/accounting/inventory/items"),
  )).toBe(false);

  const companyAccess = categories.find((c) => c.key === "company-access")!;
  expect(isSettingsCategoryActive(companyAccess, "/settings/members")).toBe(true);
  expect(isSettingsCategoryActive(companyAccess, "/settings/company")).toBe(true);
  expect(isSettingsCategoryActive(companyAccess, "/settings/profile")).toBe(false);
  expect(isSettingsCategoryActive(companyAccess, "/settings/numbering")).toBe(false);
  const documents = categories.find((category) => category.key === "documents")!;
  expect(documents.standalone).toBe(true);
  expect(isSettingsCategoryActive(documents, "/settings/documents")).toBe(true);
  expect(isSettingsCategoryActive(documents, "/reconciliation")).toBe(false);
  expect(searchSettings(categories, "بودجه")).toHaveLength(0);
  expect(searchSettings(categories, "ماژول")).toHaveLength(0);
});
