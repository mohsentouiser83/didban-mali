import type { ParsedTableImport } from "@/components/ui/table";
import { asciiDigits, persian } from "@/lib/utils";

const columns = {
  number: ["شماره چک", "شماره برگه", "شماره", "number"],
  sayad_id: ["شناسه صیادی", "صیادی", "sayad_id"],
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
  sayad_id: "شناسه صیادی",
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

export interface ChequeImportRow {
  period_id: string;
  direction: "received" | "issued";
  number: string;
  sayad_id?: string | null;
  bank_name: string;
  bank_account: string;
  party_id: string;
  amount: string;
  unit: "IRR" | "TOMAN";
  issue_date: string;
  due_date: string;
}

export interface ChequeImportPreviewRow {
  rowNumber: number;
  valid: boolean;
  error?: string;
  summary: string;
  payload?: ChequeImportRow;
}

export interface ChequeImportPreview {
  headerError?: string;
  rows: ChequeImportPreviewRow[];
}

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

export function previewChequeImport(
  data: ParsedTableImport, period: { id: string; start: string; end: string },
): ChequeImportPreview {
  const headers = data.headers.map(normalized);
  const fields = Object.keys(columns) as Field[];
  const requiredFields = fields.filter((f) => f !== "sayad_id");
  const indexes = Object.fromEntries(fields.map((field) => [
    field,
    columns[field].map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1,
  ])) as Record<Field, number>;
  const amountHeader = headers[indexes.amount];
  const headerUnit = amountHeader === "مبلغ ریال" ? "irr" : amountHeader === "مبلغ تومان" ? "toman" : "";
  const missing = requiredFields.filter((field) => indexes[field] < 0 && (field !== "unit" || !headerUnit));
  if (missing.length) {
    return {
      headerError: `ستون لازم موجود نیست: ${missing.map((field) => fieldLabels[field]).join("، ")}`,
      rows: [],
    };
  }

  const identities = new Set<string>();
  const sayadIds = new Set<string>();
  const previewRows: ChequeImportPreviewRow[] = [];
  for (const [index, row] of data.rows.entries()) {
    const cell = (field: Field) => (indexes[field] >= 0 ? String(row[indexes[field]] ?? "").trim() : "");
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
    const sayadRaw = asciiDigits(cell("sayad_id"));
    const summary = `${cell("number") || "—"} · ${cell("party_id") || "—"} · ${cell("amount") || "—"}`;
    const missingIdentity = (["number", "bank_name", "bank_account", "party_id"] as const)
      .find((field) => !cell(field));

    let errorMsg: string | undefined;
    if (missingIdentity) errorMsg = `${label}: ${fieldLabels[missingIdentity]} را وارد کنید.`;
    else if (!direction) errorMsg = `${label}: جهت دریافتنی یا صادره را مشخص کنید.`;
    else if (!unit) errorMsg = `${label}: واحد ریال یا تومان را مشخص کنید.`;
    else if (headerUnit && unit.toLowerCase() !== headerUnit) {
      errorMsg = `${label}: واحد مبلغ با عنوان ستون سازگار نیست.`;
    } else if (!issueDate || !dueDate || dueDate < issueDate) {
      errorMsg = `${label}: تاریخ صدور و سررسید میلادی معتبر لازم است (YYYY-MM-DD).`;
    } else if (issueDate < period.start || issueDate > period.end) {
      errorMsg = `${label}: تاریخ صدور در دورهٔ مالی انتخاب‌شده نیست.`;
    } else if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,6})?$/.test(rawAmount) || !/[1-9]/.test(amount)) {
      errorMsg = `${label}: مبلغ مثبت معتبر لازم است.`;
    } else if (sayadRaw && (!/^\d{16}$/.test(sayadRaw))) {
      errorMsg = `${label}: شناسه صیادی باید دقیقاً ۱۶ رقم عددی باشد.`;
    } else {
      const number = asciiDigits(cell("number"));
      const bankAccount = asciiDigits(cell("bank_account"));
      const identity = JSON.stringify([direction, bankAccount, number]);
      if (identities.has(identity)) {
        errorMsg = `${label}: شمارهٔ چک برای همین حساب و جهت تکراری است.`;
      } else if (sayadRaw && sayadIds.has(sayadRaw)) {
        errorMsg = `${label}: شناسه صیادی تکراری است.`;
      } else {
        identities.add(identity);
        if (sayadRaw) sayadIds.add(sayadRaw);
        previewRows.push({
          rowNumber: index + 1,
          valid: true,
          summary,
          payload: {
            period_id: period.id,
            direction,
            number,
            ...(sayadRaw ? { sayad_id: sayadRaw } : {}),
            bank_name: cell("bank_name"),
            bank_account: bankAccount,
            party_id: cell("party_id"),
            amount,
            unit,
            issue_date: issueDate,
            due_date: dueDate,
          },
        });
        continue;
      }
    }
    previewRows.push({
      rowNumber: index + 1,
      valid: false,
      error: errorMsg,
      summary,
    });
  }
  return { rows: previewRows };
}

export function prepareChequeImport(
  data: ParsedTableImport, period: { id: string; start: string; end: string },
) {
  const preview = previewChequeImport(data, period);
  if (preview.headerError) return { error: preview.headerError } as const;
  const firstBad = preview.rows.find((r) => !r.valid);
  if (firstBad) return { error: firstBad.error || "ردیف نامعتبر" } as const;
  return { rows: preview.rows.map((r) => r.payload!) } as const;
}
