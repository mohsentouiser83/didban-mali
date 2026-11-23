import type { ParsedTableImport } from "@/components/ui/table";
import { asciiDigits, persian } from "@/lib/utils";

const columns = {
  number: ["شماره چک", "شماره", "number"],
  direction: ["نوع چک", "نوع", "جهت", "direction"],
  bank_name: ["نام بانک", "بانک", "bank_name"],
  bank_account: ["شماره حساب بانکی", "شماره حساب", "حساب بانکی", "bank_account"],
  party_id: ["طرف حساب", "شناسه طرف حساب", "party_id"],
  amount: ["مبلغ چک", "مبلغ", "amount", "مبلغ ریال", "مبلغ تومان"],
  unit: ["واحد مبلغ", "واحد", "unit", "currency"],
  issue_date: ["تاریخ صدور", "تاریخ دریافت", "تاریخ صدور یا دریافت", "صدور", "issue_date"],
  due_date: ["سررسید", "تاریخ سررسید", "due_date"],
} as const;

const fieldLabels = {
  number: "شماره چک",
  direction: "جهت چک",
  bank_name: "نام بانک",
  bank_account: "شماره حساب",
  party_id: "طرف‌حساب",
  amount: "مبلغ",
  unit: "واحد مبلغ",
  issue_date: "تاریخ صدور",
  due_date: "تاریخ سررسید",
};

type Field = keyof typeof columns;

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/‌/g, " ").replace(/ي/g, "ی").replace(/ك/g, "ک");
}

function isoDate(raw: string) {
  const value = asciiDigits(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return value;
}

export function prepareChequeImport(
  data: ParsedTableImport, period: { id: string; start: string; end: string },
) {
  const headers = data.headers.map(normalized);
  const fields = Object.keys(columns) as Field[];
  const indexes = Object.fromEntries(fields.map((field) => [
    field,
    columns[field].map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1,
  ])) as Record<Field, number>;
  const amountHeader = headers[indexes.amount];
  const headerUnit = amountHeader === "مبلغ ریال" ? "irr" : amountHeader === "مبلغ تومان" ? "toman" : "";
  const missing = fields.filter((field) => indexes[field] < 0 && (field !== "unit" || !headerUnit));
  if (missing.length) {
    return { error: `ستون لازم موجود نیست: ${missing.map((field) => fieldLabels[field]).join("، ")}` } as const;
  }

  const identities = new Set<string>();
  const rows = [];
  for (const [index, row] of data.rows.entries()) {
    const cell = (field: Field) => String(row[indexes[field]] ?? "").trim();
    const rawDirection = normalized(cell("direction"));
    const direction = ["issued", "صادره", "صادر شده", "پرداختی"].includes(rawDirection)
      ? "issued"
      : ["received", "دریافتی", "دریافت شده"].includes(rawDirection) ? "received" : null;
    const rawUnit = normalized(cell("unit")) || headerUnit;
    const unit = ["irr", "ریال"].includes(rawUnit) ? "IRR" : ["toman", "تومان"].includes(rawUnit) ? "TOMAN" : null;
    const issueDate = isoDate(cell("issue_date"));
    const dueDate = isoDate(cell("due_date"));
    const rawAmount = asciiDigits(cell("amount")).replaceAll("٬", ",").replace("٫", ".");
    const amount = rawAmount.replaceAll(",", "");
    const label = `ردیف دادهٔ ${persian(index + 1)}`;
    const missingIdentity = (["number", "bank_name", "bank_account", "party_id"] as const)
      .find((field) => !cell(field));

    if (missingIdentity) return { error: `${label}: ${fieldLabels[missingIdentity]} را وارد کنید.` } as const;
    if (!direction) return { error: `${label}: جهت دریافتنی یا صادره را مشخص کنید.` } as const;
    if (!unit) return { error: `${label}: واحد ریال یا تومان را مشخص کنید.` } as const;
    if (headerUnit && unit.toLowerCase() !== headerUnit) {
      return { error: `${label}: واحد مبلغ با عنوان ستون سازگار نیست.` } as const;
    }
    if (!issueDate || !dueDate || dueDate < issueDate) {
      return { error: `${label}: تاریخ صدور و سررسید میلادی معتبر لازم است (YYYY-MM-DD).` } as const;
    }
    if (issueDate < period.start || issueDate > period.end) {
      return { error: `${label}: تاریخ صدور در دورهٔ مالی انتخاب‌شده نیست.` } as const;
    }
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,6})?$/.test(rawAmount) || !/[1-9]/.test(amount)) {
      return { error: `${label}: مبلغ مثبت معتبر لازم است.` } as const;
    }
    const number = asciiDigits(cell("number"));
    const bankAccount = asciiDigits(cell("bank_account"));
    const identity = JSON.stringify([direction, bankAccount, number]);
    if (identities.has(identity)) {
      return { error: `${label}: شمارهٔ چک برای همین حساب و جهت تکراری است.` } as const;
    }
    identities.add(identity);
    rows.push({
      period_id: period.id,
      direction,
      number,
      bank_name: cell("bank_name"),
      bank_account: bankAccount,
      party_id: cell("party_id"),
      amount,
      unit,
      issue_date: issueDate,
      due_date: dueDate,
    });
  }
  return { rows } as const;
}
