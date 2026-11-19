import { expect, it } from "vitest";
import {
  FilesIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import { navigationGroups } from "./navigation-catalog";

it("includes an artificial intelligence navigation item in financial workspace like modern accounting suites", () => {
  const financialGroup = navigationGroups.find(
    (group) => group.label === "فضای مالی",
  );
  expect(financialGroup).toBeDefined();

  const aiItem = financialGroup?.items.find(
    (item) => item.href === "/assistant",
  );
  expect(aiItem).toBeDefined();
  expect(aiItem?.label).toBe("هوش مصنوعی");
  expect(aiItem?.icon).toBe(SparkleIcon);
  expect(aiItem?.badge).toBe("AI");
});

it("includes documents in sidebar and excludes redundant upload/employee and base definition items", () => {
  const documentsGroup = navigationGroups.find(
    (group) => group.label === "مدارک و فایل‌ها",
  );
  expect(documentsGroup).toBeDefined();
  expect(documentsGroup?.items.map((i) => i.href)).toEqual(["/sources"]);
  expect(documentsGroup?.items[0].icon).toBe(FilesIcon);

  // Confirms base definitions group is moved to settings gear menu
  const baseDefinitionsGroup = navigationGroups.find(
    (group) => group.label === "تعاریف پایه",
  );
  expect(baseDefinitionsGroup).toBeUndefined();

  // Confirms automation group is completely removed
  const automationGroup = navigationGroups.find(
    (group) => group.label === "خودکارسازی و سامانه",
  );
  expect(automationGroup).toBeUndefined();

  const allHrefs = navigationGroups.flatMap((g) => g.items.map((i) => i.href));
  expect(allHrefs).not.toContain("/uploads");
  expect(allHrefs).not.toContain("/employees");
  expect(allHrefs).not.toContain("/settings/accounts");
  expect(allHrefs).not.toContain("/settings/periods");
  expect(allHrefs).not.toContain("/settings/dimensions");
  expect(allHrefs).not.toContain("/settings/rules");
  expect(allHrefs).not.toContain("/settings/learning");
  expect(allHrefs).not.toContain("/settings/modules");
  expect(allHrefs).not.toContain("/settings/model");
});
