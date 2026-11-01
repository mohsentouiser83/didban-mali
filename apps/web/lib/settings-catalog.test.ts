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
    "/uploads",
    "/sources",
    "/settings/company",
    "/settings/periods",
    "/settings/usage",
  ]);
  expect(searchSettings(viewer, "اعضا")).toEqual([]);
  expect(searchSettings(viewer, "تعرفه")).toEqual([]);
  expect(searchSettings(viewer, "تلگرام")[0].href).toBe("/settings/connections");
  expect(searchSettings(viewer, "بله")[0].href).toBe("/settings/connections");
  expect(
    settingsCategoryDestination(
      viewer.find((category) => category.key === "company-access")!,
    ),
  ).toBe("/settings/company");
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
