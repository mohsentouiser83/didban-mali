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
    "/settings/connections",
    "/employees",
    "/settings/modules",
    "/accounting",
    "/settings/accounts",
    "/settings/rules",
    "/settings/learning",
    "/uploads",
    "/sources",
    "/settings/dimensions",
    "/settings/company",
    "/settings/periods",
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

it("keeps accounting destinations inside the existing documents gear category", () => {
  const categories = visibleSettingsCategories({
    hasCompany: true,
    role: "owner",
    installationAdmin: false,
  });
  const documents = categories.find(
    (category) => category.key === "documents",
  )!;
  expect(documents.items.map((item) => item.href)).toEqual([
    "/accounting",
    "/settings/accounts",
    "/settings/rules",
    "/settings/learning",
    "/uploads",
    "/sources",
  ]);
  expect(settingsCategoryDestination(documents)).toBe("/settings/documents");
  expect(searchSettings(categories, "کدینگ")[0].href).toBe("/settings/accounts");
});
