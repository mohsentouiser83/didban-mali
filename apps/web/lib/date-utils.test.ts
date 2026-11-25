import { describe, expect, it } from "vitest";
import {
  formatDateInput,
  isoDate,
  isoToJalali,
  jalaliToIso,
  parseJalaliInput,
  toGregorianIso,
} from "./date-utils";

describe("date-utils", () => {
  it("parseJalaliInput: parses and normalizes Persian date strings", () => {
    const normal = parseJalaliInput("1405/05/02");
    expect(normal).toEqual({ y: 1405, m: 5, d: 2, formatted: "1405/05/02" });

    const singleDigits = parseJalaliInput("1405/5/2");
    expect(singleDigits).toEqual({ y: 1405, m: 5, d: 2, formatted: "1405/05/02" });

    const persianDigits = parseJalaliInput("۱۴۰۵/۰۵/۰۲");
    expect(persianDigits).toEqual({ y: 1405, m: 5, d: 2, formatted: "1405/05/02" });

    const dashed = parseJalaliInput("1405-05-02");
    expect(dashed).toEqual({ y: 1405, m: 5, d: 2, formatted: "1405/05/02" });

    // Invalid inputs
    expect(parseJalaliInput("")).toBeNull();
    expect(parseJalaliInput("abcd")).toBeNull();
    expect(parseJalaliInput("1405/13/01")).toBeNull(); // month > 12
    expect(parseJalaliInput("1405/05/32")).toBeNull(); // day > 31
    expect(parseJalaliInput("1100/01/01")).toBeNull(); // year out of range
  });

  it("jalaliToIso: converts Jalali dates to Gregorian ISO and validates calendar rules", () => {
    expect(jalaliToIso("1405/05/02")).toBe("2026-07-24");
    expect(jalaliToIso("1405/5/2")).toBe("2026-07-24");
    expect(jalaliToIso("۱۴۰۵/۰۵/۰۲")).toBe("2026-07-24");

    // Leap year: 1403 Esfand had 30 days
    expect(jalaliToIso("1403/12/30")).toBe("2025-03-20");

    // Non-leap year: 1402 Esfand had 29 days
    expect(jalaliToIso("1402/12/30")).toBeNull();

    // Month 6 (Shahrivar) has 31 days
    expect(jalaliToIso("1405/06/31")).toBe("2026-09-22");

    // Month 7 (Mehr) has 30 days
    expect(jalaliToIso("1405/07/31")).toBeNull();
  });

  it("isoToJalali: formats Gregorian ISO dates to Jalali YYYY/MM/DD", () => {
    expect(isoToJalali("2026-07-24")).toBe("1405/05/02");
    expect(isoToJalali("1405/05/02")).toBe("1405/05/02");
    expect(isoToJalali("1405-5-2")).toBe("1405/05/02");
    expect(isoToJalali("")).toBe("");
  });

  it("toGregorianIso: resolves both Jalali and Gregorian values into ISO format", () => {
    expect(toGregorianIso("2026-07-24")).toBe("2026-07-24");
    expect(toGregorianIso("1405/05/02")).toBe("2026-07-24");
    expect(toGregorianIso("۱۴۰۵/۰۵/۰۲")).toBe("2026-07-24");
    expect(toGregorianIso("")).toBe("");
  });

  it("formatDateInput: controls and enforces the typing format", () => {
    // Typing without slashes
    expect(formatDateInput("1")).toBe("1");
    expect(formatDateInput("14")).toBe("14");
    expect(formatDateInput("140")).toBe("140");
    expect(formatDateInput("1405", "140")).toBe("1405/");
    expect(formatDateInput("14050", "1405")).toBe("1405/0");
    expect(formatDateInput("140505", "14050")).toBe("1405/05/");
    expect(formatDateInput("1405050", "140505")).toBe("1405/05/0");
    expect(formatDateInput("14050502", "1405050")).toBe("1405/05/02");

    // Manual slashes do not duplicate
    expect(formatDateInput("1405/", "1405")).toBe("1405/");
    expect(formatDateInput("1405//", "1405/")).toBe("1405/");
    expect(formatDateInput("1405/05/", "1405/05")).toBe("1405/05/");

    // Backspace deletes without re-adding slashes
    expect(formatDateInput("1405", "1405/")).toBe("1405");
    expect(formatDateInput("1405/05", "1405/05/")).toBe("1405/05");

    // Persian digits convert automatically
    expect(formatDateInput("۱۴۰۵۰۵۰۲")).toBe("1405/05/02");
    expect(formatDateInput("۱۴۰۵/۰۵/۰۲")).toBe("1405/05/02");

    // Pasted formats with dashes
    expect(formatDateInput("1405-05-02")).toBe("1405/05/02");
  });

  it("isoDate: formats Date object to YYYY-MM-DD", () => {
    const d = new Date(2026, 6, 24); // July 24, 2026
    expect(isoDate(d)).toBe("2026-07-24");
  });
});
