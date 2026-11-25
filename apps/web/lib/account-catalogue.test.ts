import { describe, expect, it } from "vitest";
import {
  ACCOUNT_LEVEL_OPTIONS,
  isAccountPostable,
  parentAccountLevel,
  suggestAccountCode,
  validateAccountCodePattern,
} from "./account-catalogue";

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
});
