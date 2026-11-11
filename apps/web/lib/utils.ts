import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...values: ClassValue[]) {
  return twMerge(clsx(values));
}
export function persian(value: string | number) {
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
export function asciiDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}
export function amount(
  value: string | null | undefined,
  unit: "IRR" | "TOMAN" = "IRR",
) {
  if (value == null || value === "") return "—";
  const negative = value.startsWith("-");
  let [integer, fraction = ""] = value.replace(/^[+-]/, "").split(".");
  if (unit === "TOMAN") {
    fraction = integer.slice(-1) + fraction;
    integer = integer.slice(0, -1) || "0";
  }
  fraction = fraction.replace(/0+$/, "");
  return persian(
    `${negative ? "−" : ""}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, "٬")}${fraction ? "٫" + fraction : ""}`,
  );
}
export function displayDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value.includes("T") ? value : value + "T12:00:00");
  return Number.isNaN(parsed.getTime())
    ? persian(value)
    : new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(parsed);
}
export function isoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
