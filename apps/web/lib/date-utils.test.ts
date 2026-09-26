import { describe, it, expect } from "vitest";
import {
  toJalaliDate,
  toJalaliDateTime,
  toRelativeTime,
  toPersianDigits,
} from "./date-utils";

describe("date-utils", () => {
  describe("toPersianDigits", () => {
    it("converts ASCII digits to Persian digits", () => {
      expect(toPersianDigits("0123456789")).toBe("۰۱۲۳۴۵۶۷۸۹");
      expect(toPersianDigits(1403)).toBe("۱۴۰۳");
      expect(toPersianDigits("12.4 میلیارد")).toBe("۱۲.۴ میلیارد");
    });

    it("handles null and undefined gracefully", () => {
      expect(toPersianDigits(null)).toBe("");
      expect(toPersianDigits(undefined)).toBe("");
      expect(toPersianDigits("")).toBe("");
    });
  });

  describe("toJalaliDate", () => {
    it("formats ISO date string into Jalali date", () => {
      const formatted = toJalaliDate("2026-03-21");
      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe("string");
      // Contains Persian digits
      expect(formatted).toMatch(/[۰-۹]/);
    });

    it("returns fallback dash for invalid dates", () => {
      expect(toJalaliDate(null)).toBe("—");
      expect(toJalaliDate(undefined)).toBe("—");
      expect(toJalaliDate("invalid-date")).toBe("—");
    });
  });

  describe("toJalaliDateTime", () => {
    it("formats ISO datetime string into Jalali datetime", () => {
      const formatted = toJalaliDateTime("2026-03-21T10:30:00Z");
      expect(formatted).toBeDefined();
      expect(formatted).toMatch(/[۰-۹]/);
    });

    it("returns fallback dash for invalid datetimes", () => {
      expect(toJalaliDateTime(null)).toBe("—");
      expect(toJalaliDateTime(undefined)).toBe("—");
    });
  });

  describe("toRelativeTime", () => {
    it("formats relative past time in Persian", () => {
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
      const formatted = toRelativeTime(tenMinutesAgo);
      expect(formatted).toContain("دقیقه");
    });

    it("returns fallback dash for invalid dates", () => {
      expect(toRelativeTime(null)).toBe("—");
      expect(toRelativeTime("not-a-date")).toBe("—");
    });
  });
});
