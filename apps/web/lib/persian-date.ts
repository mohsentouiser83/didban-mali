import { getDateLib } from "@daypicker/persian";

const persian = getDateLib({ numerals: "arabext" });
const latin = getDateLib({ numerals: "latn" });

export function dateToISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Use local noon instead of parsing an ISO string as UTC: calendar days must
// never change when the browser's time zone changes.
export function dateFromISO(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return dateToISO(date) === value ? date : undefined;
}

export function formatPersianDate(value: string): string {
  const date = dateFromISO(value);
  return date ? persian.format(date, "yyyy/MM/dd") : "";
}

export function parsePersianDate(value: string): Date | undefined {
  const normalized = value.trim().replace(/[۰-۹٠-٩]/g, (digit) =>
    String("۰۱۲۳۴۵۶۷۸۹".includes(digit)
      ? "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)
      : "٠١٢٣٤٥٦٧٨٩".indexOf(digit)),
  );
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(normalized);
  if (!match) return undefined;
  const [, y, m, d] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  try {
    const date = latin.newDate(year, month - 1, day);
    date.setHours(12, 0, 0, 0);
    const expected = `${y}/${m.padStart(2, "0")}/${d.padStart(2, "0")}`;
    return latin.format(date, "yyyy/MM/dd") === expected ? date : undefined;
  } catch {
    return undefined;
  }
}
