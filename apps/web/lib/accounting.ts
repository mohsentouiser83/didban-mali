export type AccountNature = "debit" | "credit" | "floating" | "none";

export const ACCOUNT_NATURE_OPTIONS: { value: AccountNature; label: string }[] = [
  { value: "debit", label: "بدهکار" },
  { value: "credit", label: "بستانکار" },
  { value: "floating", label: "شناور (دوگانه)" },
  { value: "none", label: "فاقد ماهیت / انتظامی" },
];

export function accountNatureLabel(nature?: string): string {
  switch (nature) {
    case "debit":
      return "بدهکار";
    case "credit":
      return "بستانکار";
    case "floating":
      return "شناور (دوگانه)";
    case "none":
      return "فاقد ماهیت / انتظامی";
    default:
      return nature || "بدهکار";
  }
}

export interface LedgerAccount {
  id: string;
  code: string;
  level?: import("./account-catalogue").AccountLevel | null;
  parent_id?: string | null;
  parent_code?: string | null;
  parent_name?: string | null;
  has_children?: boolean;
  postable?: boolean;
  code_status?: "standard" | "legacy" | null;
  code_pattern_valid?: boolean | null;
  can_add_standard_child?: boolean;
  name: string;
  nature: AccountNature;
  role?: string | null;
  active: boolean;
  version: number;
}
export interface JournalDraftLine {
  account_id: string;
  debit: string;
  credit: string;
  party_id: string;
  original_debit?: string;
  original_credit?: string;
}
export interface JournalDraft {
  id: string;
  period_id: string;
  date: string;
  description: string;
  lines: JournalDraftLine[];
  state: string;
  inventory_origin?: boolean;
  reference?: string | null;
  operation_kind?: string | null;
  version: number;
  original_unit: "IRR" | "TOMAN";
}
export interface JournalDraftResponseLine {
  account_id: string;
  debit: string;
  credit: string;
  original_debit: string;
  original_credit: string;
  party_id?: string | null;
  counterparty_id?: string | null;
  description?: string | null;
  reference_kind?: string | null;
  reference_id?: string | null;
  dimension_ids: string[];
}
export interface JournalDraftWriteResponse extends Omit<JournalDraft, "lines" | "state"> {
  company_id: string;
  actor_id: string;
  created_at: string;
  lines: JournalDraftResponseLine[];
  state: "draft" | "posted" | "discarded";
  posting_available: boolean;
  posting_reason: string | null;
}
export interface DraftFormValue {
  unit: "IRR" | "TOMAN";
  period_id: string;
  date: string;
  description: string;
  lines: JournalDraftLine[];
}
export interface AccountingCapabilities {
  can_prepare: boolean;
  can_manage_accounts: boolean;
  can_manage_permissions: boolean;
  can_post: boolean;
  can_reopen: boolean;
  can_view_payroll?: boolean;
  posting_available: boolean;
  posting_reason: string;
}
export interface AccountingPermission {
  membership_id: string;
  name: string;
  role: string;
  version: number;
  post_journal: boolean;
  reopen_period: boolean;
  view_payroll: boolean;
  implicit_authority: boolean;
}
export const emptyDraftLine = (): JournalDraftLine => ({
  account_id: "",
  debit: "",
  credit: "",
  party_id: "",
});
export function draftFormValue(
  draft?: JournalDraft,
  periodId = "",
): DraftFormValue {
  return draft
    ? {
        unit: "IRR",
        period_id: draft.period_id,
        date: draft.date,
        description: draft.description,
        lines: draft.lines.map((line) => ({
          ...line,
          debit: line.debit,
          credit: line.credit,
        })),
      }
    : {
        unit: "IRR",
        period_id: periodId,
        date: "",
        description: "",
        lines: [emptyDraftLine(), emptyDraftLine()],
      };
}
/** Six decimal places match the API's exact Money range; never use float sums. */
export function exactAmount(value: string): bigint | null {
  if (!/^\d+(\.\d{1,6})?$/.test(value)) return null;
  const [integer, fraction = ""] = value.split(".");
  if (integer.length > 32) return null;
  return BigInt(integer) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}
export function exactText(value: bigint): string {
  const fraction = String(value % 1_000_000n)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return String(value / 1_000_000n) + (fraction ? "." + fraction : "");
}
export function draftValidation(value: DraftFormValue) {
  const errors: Record<string, string> = {};
  if (!value.period_id) errors["draft-period"] = "دوره را انتخاب کنید.";
  if (!value.date) errors["draft-date"] = "تاریخ را انتخاب کنید.";
  if (!value.description.trim())
    errors["draft-description"] = "شرح سند را وارد کنید.";
  let debit = 0n;
  let credit = 0n;
  let invalidAmount = false;
  for (const [index, line] of value.lines.entries()) {
    if (!line.account_id)
      errors[`line-${index}-account`] = "حساب را انتخاب کنید.";
    const left = exactAmount(line.debit || "0");
    const right = exactAmount(line.credit || "0");
    if (left === null || right === null) invalidAmount = true;
    if (left === null)
      errors[`line-${index}-debit`] =
        "مبلغ معتبر با حداکثر ۶ رقم اعشار وارد کنید.";
    if (right === null)
      errors[`line-${index}-credit`] =
        "مبلغ معتبر با حداکثر ۶ رقم اعشار وارد کنید.";
    if (left !== null && right !== null) {
      if ((left === 0n && right === 0n) || (left > 0n && right > 0n))
        errors[`line-${index}-debit`] =
          "فقط یکی از بدهکار یا بستانکار باید مثبت باشد.";
      debit += left;
      credit += right;
    }
  }
  if (value.lines.length < 2) errors.lines = "حداقل دو ردیف لازم است.";
  if (debit !== credit) errors.balance = "جمع بدهکار و بستانکار برابر نیست.";
  return {
    errors,
    totalDebit: invalidAmount ? null : exactText(debit),
    totalCredit: invalidAmount ? null : exactText(credit),
    difference: invalidAmount ? null : exactText(debit > credit ? debit - credit : credit - debit),
  };
}
export function draftPayload(value: DraftFormValue) {
  return {
    ...value,
    description: value.description.trim(),
    lines: value.lines.map((line) => ({
      account_id: line.account_id,
      debit: line.debit || "0",
      credit: line.credit || "0",
      party_id: line.party_id.trim(),
    })),
  };
}
