import { groupMoneyDigits } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { choiceLabels } from "./labels";
export const moneyFields = new Set([
  "amount",
  "balance",
  "debit",
  "credit",
  "gross",
  "vat",
  "total_obligation",
  "paid_as_of",
  "deposit",
  "withdrawal",
  "opening_debit",
  "opening_credit",
  "period_debit",
  "period_credit",
  "closing_debit",
  "closing_credit",
]);
const dateFields = new Set(["date", "issued_on", "due_on", "paid_on"]);
export function formatCanonical(field: string, value: string | null): string {
  if (value === null) return "نامعلوم";
  if (moneyFields.has(field) && /^-?\d+(\.\d+)?$/.test(value)) {
    const [whole, fraction] = value.split(".");
    const grouped = groupMoneyDigits(whole);
    return `${grouped}${fraction ? "٫" + fraction : ""}`.replace(
      /\d/g,
      (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)],
    );
  }
  if (dateFields.has(field)) return formatDate(value);
  if (field === "confirmed") return value === "true" ? "بله" : "خیر";
  if (field === "role_provenance")
    return (
      (
        {
          user_declaration: "اظهار کاربر",
          explicit_source_field: "فیلد صریح منبع",
          validated_policy: "تشخیص خودکار کنترل‌شده",
        } as Record<string, string>
      )[value] ?? "نامشخص"
    );
  if (field === "role_controls_passed")
    return value === "true" ? "معتبر" : "نیازمند بررسی";
  return choiceLabels[value] ?? value;
}
