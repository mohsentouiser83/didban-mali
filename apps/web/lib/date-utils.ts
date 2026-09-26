/**
 * دیدبان مالی — ماژول واحد و سراسری قالب‌بندی تاریخ و زمان جلالی (شمسی)
 * Unified Persian / Jalali Date & Time Utilities
 */

const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toPersianDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value).replace(/\d/g, (d) => persianDigits[parseInt(d, 10)] ?? d);
}

function parseDateInput(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  const str = String(value).trim();
  if (!str) return null;

  // Handle YYYY-MM-DD or ISO strings
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(`${str}T12:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * تاریخ شمسی استاندارد (مثال: ۱ مهر ۱۴۰۵ یا ۱۴۰۵/۰۷/۰۱)
 */
export function toJalaliDate(
  value: string | Date | null | undefined,
  style: "long" | "medium" | "numeric" = "medium"
): string {
  const date = parseDateInput(value);
  if (!date) return "—";

  try {
    if (style === "numeric") {
      const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
      return parts;
    }

    if (style === "long") {
      return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(date);
    }

    // Default medium
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return String(value);
  }
}

/**
 * تاریخ و زمان شمسی دقیق (مثال: ۱ مهر ۱۴۰۵، ساعت ۰۹:۴۲)
 */
export function toJalaliDateTime(value: string | Date | null | undefined): string {
  const date = parseDateInput(value);
  if (!date) return "—";

  try {
    const formatted = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
    return formatted;
  } catch {
    return String(value);
  }
}

/**
 * زمان نسبی فارسی (مثال: ۳ ساعت پیش، ۲ روز پیش، امروز، لحظاتی پیش)
 */
export function toRelativeTime(value: string | Date | null | undefined): string {
  const date = parseDateInput(value);
  if (!date) return "—";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "لحظاتی پیش";
  if (diffMin < 60) return `${toPersianDigits(diffMin)} دقیقه پیش`;
  if (diffHour < 24) return `${toPersianDigits(diffHour)} ساعت پیش`;
  if (diffDay === 1) return "دیروز";
  if (diffDay < 7) return `${toPersianDigits(diffDay)} روز پیش`;
  if (diffDay < 30) return `${toPersianDigits(Math.floor(diffDay / 7))} هفته پیش`;
  if (diffDay < 365) return `${toPersianDigits(Math.floor(diffDay / 30))} ماه پیش`;

  return toJalaliDate(date, "medium");
}
