import { choiceLabels } from "@/features/interpretation/labels";
import { formatMoney } from "@/features/results/presentation";
import { formatDate, persianDigits } from "@/lib/dates";
import { moneyFields } from "@/features/interpretation/format-values";
const dateFields = new Set(["date", "issued_on", "due_on"]);
const choices = new Set(["role", "row_type", "unit", "original_unit"]);
const identifiers = new Set(["account", "bank_account", "entry_id"]);
export function evidenceInputValue(key: string, value: unknown): string {
  const text = String(value);
  if (moneyFields.has(key)) return `${formatMoney(text, "IRR")} ریال`;
  if (dateFields.has(key)) return formatDate(text);
  if (choices.has(key)) return choiceLabels[text] ?? "نامشخص";
  return identifiers.has(key) ? text : persianDigits(text);
}
