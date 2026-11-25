// Persian Solar (Jalali) to Gregorian Date Converter
export function jalaliToGregorian(jYear: number, jMonth: number, jDay: number): string {
  const gDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const jDaysInMonth = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

  const jy = jYear - 979;
  const jm = jMonth - 1;
  const jd = jDay - 1;

  let jDayNo = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4);
  for (let i = 0; i < jm; ++i) jDayNo += jDaysInMonth[i];
  jDayNo += jd;

  let gDayNo = jDayNo + 79;

  let gy = 1600 + 400 * Math.floor(gDayNo / 146097);
  gDayNo = gDayNo % 146097;

  let leap = true;
  if (gDayNo >= 36525) {
    gDayNo--;
    gy += 100 * Math.floor(gDayNo / 36524);
    gDayNo = gDayNo % 36524;

    if (gDayNo >= 365) gDayNo++;
    else leap = false;
  }

  gy += 4 * Math.floor(gDayNo / 1461);
  gDayNo %= 1461;

  if (gDayNo >= 366) {
    leap = false;
    gDayNo--;
    gy += Math.floor(gDayNo / 365);
    gDayNo = gDayNo % 365;
  }

  let gm = 0;
  for (let i = 0; i < 12; i++) {
    const daysInMonth = i === 1 && leap ? 29 : gDaysInMonth[i];
    if (gDayNo < daysInMonth) {
      gm = i + 1;
      break;
    }
    gDayNo -= daysInMonth;
  }
  const gd = gDayNo + 1;

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${gy}-${pad(gm)}-${pad(gd)}`;
}

export function parseJalaliInput(text: string): { y: number; m: number; d: number; formatted: string } | null {
  if (!text) return null;
  const clean = text
    .replace(/[۰-۹٠-٩]/g, (c) => String(c.charCodeAt(0) & 15))
    .replace(/[^0-9/-]/g, "")
    .replace(/-/g, "/");

  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(clean);
  if (!match) return null;

  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);

  if (y < 1200 || y > 1600 || m < 1 || m > 12 || d < 1 || d > 31) return null;

  const formatted = `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
  return { y, m, d, formatted };
}

export function jalaliToIso(jalaliStr: string): string | null {
  try {
    const parsed = parseJalaliInput(jalaliStr);
    if (!parsed) return null;
    const iso = jalaliToGregorian(parsed.y, parsed.m, parsed.d);
    const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    }).formatToParts(new Date(iso + "T12:00:00Z"));
    const jy = Number(parts.find((p) => p.type === "year")?.value);
    const jm = Number(parts.find((p) => p.type === "month")?.value);
    const jd = Number(parts.find((p) => p.type === "day")?.value);
    if (jy !== parsed.y || jm !== parsed.m || jd !== parsed.d) return null;
    return iso;
  } catch {
    return null;
  }
}

export function isoToJalali(iso: string): string {
  if (!iso) return "";
  const clean = iso
    .replace(/[۰-۹٠-٩]/g, (c) => String(c.charCodeAt(0) & 15))
    .replace(/-/g, "/");
  const jalaliMatch = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(clean);
  if (jalaliMatch && Number(jalaliMatch[1]) < 1700) {
    const y = jalaliMatch[1];
    const m = String(Number(jalaliMatch[2])).padStart(2, "0");
    const d = String(Number(jalaliMatch[3])).padStart(2, "0");
    return `${y}/${m}/${d}`;
  }

  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).formatToParts(date);
  const jy = parts.find((p) => p.type === "year")?.value;
  const jm = parts.find((p) => p.type === "month")?.value;
  const jd = parts.find((p) => p.type === "day")?.value;
  if (!jy || !jm || !jd) return "";
  return `${jy}/${jm}/${jd}`;
}

export function toGregorianIso(val: string): string {
  if (!val) return "";
  const clean = val
    .replace(/[۰-۹٠-٩]/g, (c) => String(c.charCodeAt(0) & 15))
    .replace(/-/g, "/");
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(clean);
  if (match && Number(match[1]) < 1700) {
    return jalaliToIso(clean) || "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return val;
  }
  return "";
}

export function formatDateInput(val: string, prevVal = ""): string {
  const clean = val
    .replace(/[۰-۹٠-٩]/g, (c) => String(c.charCodeAt(0) & 15))
    .replace(/[^0-9/-]/g, "")
    .replace(/-/g, "/")
    .replace(/\/+/g, "/");

  if (prevVal && clean.length < prevVal.length) {
    return clean.slice(0, 10);
  }

  if (!clean.includes("/")) {
    if (clean.length > 6) {
      return `${clean.slice(0, 4)}/${clean.slice(4, 6)}/${clean.slice(6, 8)}`;
    }
    if (clean.length > 4) {
      const y = clean.slice(0, 4);
      const m = clean.slice(4, 6);
      return m.length === 2 ? `${y}/${m}/` : `${y}/${m}`;
    }
    if (clean.length === 4) {
      return `${clean}/`;
    }
    return clean.slice(0, 4);
  }

  const parts = clean.split("/");
  const y = parts[0].slice(0, 4);
  const m = parts[1] !== undefined ? parts[1].slice(0, 2) : undefined;
  const d = parts[2] !== undefined ? parts[2].slice(0, 2) : undefined;

  if (parts.length === 1) {
    if (y.length === 4) {
      return `${y}/`;
    }
    return y;
  }

  let res = y + "/" + (m !== undefined ? m : "");
  if (parts.length > 2) {
    res += "/" + (d !== undefined ? d : "");
  } else if (m && m.length === 2 && (val.endsWith("/") || clean.length >= 7)) {
    res += "/";
  }

  return res.slice(0, 10);
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
