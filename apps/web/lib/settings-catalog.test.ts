import { expect, it } from "vitest";
import {
  visibleSettingsCategories,
  searchSettings,
  settingsCategoryDestination,
  isSettingsCategoryActive,
} from "./settings-catalog";
it("shows only real authorized settings and does not reveal owner or installation administration through search", () => {
  const viewer = visibleSettingsCategories({
    hasCompany: true,
    role: "viewer",
    installationAdmin: false,
  });
  expect(
    viewer.flatMap((group) => group.items.map((item) => item.href)),
  ).toEqual([
    "/accounting",
    "/settings/accounts",
    "/settings/periods",
    "/settings/dimensions",
    "/uploads",
    "/sources",
    "/settings/rules",
    "/settings/learning",
    "/settings/company",
    "/employees",
    "/settings/modules",
    "/settings/connections",
    "/settings/usage",
  ]);
  expect(searchSettings(viewer, "اعضا")).toEqual([]);
  expect(searchSettings(viewer, "تعرفه")).toEqual([]);
  expect(searchSettings(viewer, "تلگرام")[0].href).toBe(
    "/settings/connections",
  );
  expect(searchSettings(viewer, "بله")[0].href).toBe("/settings/connections");
  expect(
    settingsCategoryDestination(
      viewer.find((category) => category.key === "company-access")!,
    ),
  ).toBe("/settings/company-access");
});
it("uses the company hub when both authorized destinations are available and searches the same catalog", () => {
  const owner = visibleSettingsCategories({
    hasCompany: true,
    role: "owner",
    installationAdmin: true,
  });
  expect(
    settingsCategoryDestination(
      owner.find((category) => category.key === "company-access")!,
    ),
  ).toBe("/settings/company-access");
  expect(searchSettings(owner, "اعضا")[0].href).toBe("/settings/members");
  expect(searchSettings(owner, "تعرفه")[0].href).toBe("/settings/model");
  expect(
    isSettingsCategoryActive(
      owner.find((category) => category.key === "company-access")!,
      "/settings/members",
    ),
  ).toBe(true);
});
it("offers only company creation to an installation administrator without a company", () => {
  const categories = visibleSettingsCategories({
    hasCompany: false,
    installationAdmin: true,
  });
  expect(
    categories.flatMap((group) => group.items.map((item) => item.href)),
  ).toEqual(["/settings/company"]);
});

it("separates accounting, source files, automation and company management with independent links last", () => {
  const categories = visibleSettingsCategories({
    hasCompany: true,
    role: "owner",
    installationAdmin: true,
  });
  expect(categories.map((category) => [category.key, category.items.map((item) => item.href)])).toEqual([
    ["accounting", ["/accounting", "/settings/accounts", "/settings/periods", "/settings/dimensions"]],
    ["documents", ["/uploads", "/sources"]],
    ["automation", ["/settings/rules", "/settings/learning", "/settings/model"]],
    ["company-access", ["/settings/company", "/settings/members", "/employees", "/settings/modules"]],
    ["connections", ["/settings/connections"]],
    ["usage", ["/settings/usage"]],
  ]);
  expect(categories.filter((category) => category.standalone).map((category) => category.key))
    .toEqual(["connections", "usage"]);
  expect(categories.map(settingsCategoryDestination)).toEqual([
    "/settings/accounting", "/settings/documents", "/settings/automation",
    "/settings/company-access", "/settings/connections", "/settings/usage",
  ]);
  expect(searchSettings(categories, "کدینگ")[0].categoryTitle).toBe("حسابداری");
  expect(searchSettings(categories, "حافظه اصلاحات")[0].categoryTitle).toBe("خودکارسازی و هوش مصنوعی");
  expect(searchSettings(categories, "منابع و اصل اسناد")[0].categoryTitle).toBe("فایل‌ها و منابع");
  const accounting = categories.find((category) => category.key === "accounting")!;
  expect(isSettingsCategoryActive(accounting, "/settings/periods")).toBe(true);
  expect(isSettingsCategoryActive(accounting, "/settings/dimensions")).toBe(true);
  expect(isSettingsCategoryActive(accounting, "/sources")).toBe(false);
});
