import { describe, expect, it } from "vitest";
import { dateFromISO, dateToISO, formatPersianDate, parsePersianDate } from "./persian-date";

describe("Persian date conversion", () => {
  it("round trips Nowruz without shifting the calendar day", () => {
    expect(formatPersianDate("2026-03-21")).toBe("۱۴۰۵/۰۱/۰۱");
    expect(dateToISO(parsePersianDate("۱۴۰۵/۰۱/۰۱")!)).toBe("2026-03-21");
    expect(dateToISO(parsePersianDate("١٤٠٥/١/١")!)).toBe("2026-03-21");
    expect(dateToISO(parsePersianDate("1405-1-1")!)).toBe("2026-03-21");
    expect(dateToISO(dateFromISO("2026-06-21")!)).toBe("2026-06-21");
  });

  it("checks Persian leap years and month lengths", () => {
    expect(parsePersianDate("1403/12/30")).toBeDefined();
    expect(parsePersianDate("1404/12/30")).toBeUndefined();
    expect(parsePersianDate("1405/07/31")).toBeUndefined();
    expect(parsePersianDate("1405/03/31")).toBeDefined();
    expect(parsePersianDate("1405/13/01")).toBeUndefined();
    expect(parsePersianDate("1405/01/00")).toBeUndefined();
    expect(dateFromISO("2026-02-30")).toBeUndefined();
    expect(dateFromISO("")).toBeUndefined();
  });
});
