import { getDateLib } from "@daypicker/persian";
const calendar = getDateLib({ numerals: "latn" });
export const latinDigits = (text: string) =>
  text
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632));
export const persianDigits = (text: string) =>
  text.replace(/\d/g, (c) => "۰۱۲۳۴۵۶۷۸۹"[Number(c)]);
export function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function parseJalali(text: string): string | null {
  const normalized = latinDigits(text.trim()).replaceAll("-", "/");
  if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(normalized)) return null;
  const [y, m, d] = normalized.split("/").map(Number);
  if (y < 1300 || y > 1600 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = calendar.newDate(y, m - 1, d);
  return calendar.format(date, "yyyy/M/d") === `${y}/${m}/${d}`
    ? isoDate(date)
    : null;
}
export function formatDate(iso: string) {
  return persianDigits(
    calendar.format(new Date(`${iso}T12:00:00`), "yyyy/MM/dd"),
  );
}
export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(new Date(iso));
}
