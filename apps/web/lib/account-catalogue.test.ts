import { describe, expect, it } from "vitest";
import {
  ACCOUNT_LEVEL_OPTIONS,
  buildAccountTreeRows,
  childAccountLevel,
  isAccountPostable,
  parentAccountLevel,
  suggestAccountCode,
  validateAccountCodePattern,
  visibleAccountRoleOptions,
} from "./account-catalogue";
import type { LedgerAccount } from "./accounting";

describe("4-level account coding catalogue", () => {
  it("defines group -> general -> subsidiary -> detail hierarchy", () => {
    expect(ACCOUNT_LEVEL_OPTIONS.map((o) => o.value)).toEqual([
      "group",
      "general",
      "subsidiary",
      "detail",
    ]);
    expect(parentAccountLevel("group")).toBeNull();
    expect(parentAccountLevel("general")).toBe("group");
    expect(parentAccountLevel("subsidiary")).toBe("general");
    expect(parentAccountLevel("detail")).toBe("subsidiary");
  });

  it("auto-suggests sequential 2/4/6/8-digit codes from parent prefix", () => {
    const accounts = [
      { id: "g1", code: "11" },
      { id: "k1", code: "1101" },
      { id: "m1", code: "110101" },
      { id: "d1", code: "11010101" },
    ];
    expect(suggestAccountCode(accounts, "group")).toBe("12");
    expect(suggestAccountCode(accounts, "general", "g1")).toBe("1102");
    expect(suggestAccountCode(accounts, "subsidiary", "k1")).toBe("110102");
    expect(suggestAccountCode(accounts, "detail", "m1")).toBe("11010102");
  });

  it("validates 2/4/6/8+ digit code patterns and parent prefix matching", () => {
    expect(validateAccountCodePattern("11", "group")).toBeUndefined();
    expect(validateAccountCodePattern("111", "group")).toBeTruthy();
    expect(validateAccountCodePattern("1101", "general", "11")).toBeUndefined();
    expect(validateAccountCodePattern("1201", "general", "11")).toBeTruthy();
    expect(validateAccountCodePattern("110101", "subsidiary", "1101")).toBeUndefined();
    expect(validateAccountCodePattern("11011", "subsidiary", "1101")).toBeTruthy();
    expect(validateAccountCodePattern("11010101", "detail", "110101")).toBeUndefined();
    expect(validateAccountCodePattern("1101011", "detail", "110101")).toBeTruthy();
  });

  it("marks group and parent accounts with children as non-postable", () => {
    expect(isAccountPostable({ active: true, level: "group", has_children: false })).toBe(false);
    expect(isAccountPostable({ active: true, level: "general", has_children: true })).toBe(false);
    expect(isAccountPostable({ active: true, level: "general", has_children: false })).toBe(true);
    expect(isAccountPostable({ active: true, level: "subsidiary", has_children: true })).toBe(false);
    expect(isAccountPostable({ active: true, level: "detail", has_children: false })).toBe(true);
    expect(isAccountPostable({ active: false, level: "detail", has_children: false })).toBe(false);
  });

  it("builds a 4-level hierarchical tree sorted by code and respects collapsed branches", () => {
    const accounts: LedgerAccount[] = [
      { id: "det", code: "11010101", name: "ملت", level: "detail", parent_id: "sub", nature: "debit", active: true, version: 1 },
      { id: "sub", code: "110101", name: "بانک‌ها", level: "subsidiary", parent_id: "gen", nature: "debit", active: true, version: 1 },
      { id: "grp2", code: "21", name: "بدهی‌ها", level: "group", parent_id: null, nature: "credit", active: true, version: 1 },
      { id: "gen", code: "1101", name: "نقد", level: "general", parent_id: "grp1", nature: "debit", active: true, version: 1 },
      { id: "grp1", code: "11", name: "دارایی جاری", level: "group", parent_id: null, nature: "debit", active: true, version: 1 },
    ];
    expect(childAccountLevel("group")).toBe("general");
    expect(childAccountLevel("detail")).toBeNull();

    const expanded = buildAccountTreeRows(accounts, new Set());
    expect(expanded.map((r) => [r.account.code, r.depth, r.hasChildren])).toEqual([
      ["11", 0, true],
      ["1101", 1, true],
      ["110101", 2, true],
      ["11010101", 3, false],
      ["21", 0, false],
    ]);

    const collapsedGen = buildAccountTreeRows(accounts, new Set(["gen"]));
    expect(collapsedGen.map((r) => [r.account.code, r.depth, r.hasChildren, r.expanded])).toEqual([
      ["11", 0, true, true],
      ["1101", 1, true, false],
      ["21", 0, false, true],
    ]);
  });

  it("hides inventory NRV roles in service mode unless currently selected", () => {
    const tradingRoles = visibleAccountRoleOptions("trading").map((o) => o.value);
    expect(tradingRoles).toContain("inventory_nrv_allowance");

    const serviceRoles = visibleAccountRoleOptions("service").map((o) => o.value);
    expect(serviceRoles).not.toContain("inventory_nrv_allowance");
    expect(serviceRoles).not.toContain("inventory_nrv_expense");
    expect(serviceRoles).not.toContain("inventory_nrv_recovery");
    expect(serviceRoles).toContain("revenue");

    const editingLegacy = visibleAccountRoleOptions("service", "inventory_nrv_allowance").map((o) => o.value);
    expect(editingLegacy).toContain("inventory_nrv_allowance");
  });
});
