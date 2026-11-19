import { expect, it } from "vitest";
import {
  visibleSettingsCategories,
  searchSettings,
  settingsCategoryDestination,
  isSettingsCategoryActive,
} from "./settings-catalog";

it("shows access, accounts, periods, dimensions and numbering in gear settings catalog", () => {
  const viewer = visibleSettingsCategories({
    hasCompany: true,
    role: "viewer",
    installationAdmin: false,
  });
  expect(
    viewer.flatMap((group) => group.items.map((item) => item.href)),
  ).toEqual([
    "/settings/members",
    "/settings/accounts",
    "/settings/periods",
    "/settings/dimensions",
    "/settings/numbering",
  ]);
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
  expect(
    settingsCategoryDestination(
      viewer.find((category) => category.key === "access")!,
    ),
  ).toBe("/settings/members");
  expect(
    settingsCategoryDestination(
      viewer.find((category) => category.key === "accounts")!,
    ),
  ).toBe("/settings/accounts");
  expect(
    settingsCategoryDestination(
      viewer.find((category) => category.key === "periods")!,
    ),
  ).toBe("/settings/periods");
  expect(
    settingsCategoryDestination(
      viewer.find((category) => category.key === "dimensions")!,
    ),
  ).toBe("/settings/dimensions");
  expect(
    settingsCategoryDestination(
      viewer.find((category) => category.key === "numbering")!,
    ),
  ).toBe("/settings/numbering");
});

it("offers no settings to a user without a company", () => {
  const categories = visibleSettingsCategories({
    hasCompany: false,
    installationAdmin: true,
  });
  expect(
    categories.flatMap((group) => group.items.map((item) => item.href)),
  ).toEqual([]);
});

it("checks active state for settings destinations", () => {
  const categories = visibleSettingsCategories({
    hasCompany: true,
    role: "owner",
    installationAdmin: true,
  });
  expect(categories.map((c) => c.key)).toEqual([
    "access",
    "accounts",
    "periods",
    "dimensions",
    "numbering",
  ]);
  const access = categories.find((c) => c.key === "access")!;
  expect(isSettingsCategoryActive(access, "/settings/members")).toBe(true);
  expect(isSettingsCategoryActive(access, "/settings/numbering")).toBe(false);

  const accounts = categories.find((c) => c.key === "accounts")!;
  expect(isSettingsCategoryActive(accounts, "/settings/accounts")).toBe(true);
  expect(isSettingsCategoryActive(accounts, "/settings/members")).toBe(false);

  const periods = categories.find((c) => c.key === "periods")!;
  expect(isSettingsCategoryActive(periods, "/settings/periods")).toBe(true);

  const dimensions = categories.find((c) => c.key === "dimensions")!;
  expect(isSettingsCategoryActive(dimensions, "/settings/dimensions")).toBe(true);

  const numbering = categories.find((c) => c.key === "numbering")!;
  expect(isSettingsCategoryActive(numbering, "/settings/numbering")).toBe(true);
  expect(isSettingsCategoryActive(numbering, "/settings/members")).toBe(false);
});
