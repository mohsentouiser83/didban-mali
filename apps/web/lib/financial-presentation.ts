import type { ForecastAssumption, InvoiceDetail } from "./api";
import { displayDate, persian } from "./utils";
/** Financial settlement state is independent of source-coverage availability. */
export function invoiceFinancialState(invoice: InvoiceDetail): string {
  if (invoice.remaining == null || invoice.status === "unavailable")
    return "unavailable";
  if (invoice.status && !["available", "limited"].includes(invoice.status))
    return "unknown";
  if (/^-?0+(?:\.0+)?$/.test(invoice.remaining)) return "settled";
  if (invoice.remaining.startsWith("-")) return "credit";
  return invoice.overdue ? "overdue" : "open";
}
/** Compatibility display for immutable snapshots predating bank-flow total fields. */
export function addExactAmounts(
  left: string | null | undefined,
  right: string | null | undefined,
): string | null {
  if (
    left == null ||
    right == null ||
    !/^[-+]?\d+(?:\.\d+)?$/.test(left) ||
    !/^[-+]?\d+(?:\.\d+)?$/.test(right)
  )
    return null;
  const parts = [left, right].map((value) => {
    const negative = value.startsWith("-");
    const [integer, fraction = ""] = value.replace(/^[-+]/, "").split(".");
    return { negative, integer, fraction };
  });
  const precision = Math.max(...parts.map((part) => part.fraction.length));
  const total = parts.reduce(
    (sum, part) =>
      sum +
      (part.negative ? -1n : 1n) *
        BigInt(part.integer + part.fraction.padEnd(precision, "0")),
    0n,
  );
  const negative = total < 0n;
  const digits = (negative ? -total : total)
    .toString()
    .padStart(precision + 1, "0");
  const result = precision
    ? digits.slice(0, -precision) +
      "." +
      digits.slice(-precision).replace(/0+$/, "")
    : digits;
  return (negative ? "-" : "") + result.replace(/\.$/, "");
}

export function forecastAssumptionLabel(
  assumption: string | ForecastAssumption,
): string {
  if (typeof assumption === "string") return assumption;
  const payment = assumption.basis === "human_expected_payment_date";
  const date = assumption.expected_date
    ? displayDate(assumption.expected_date)
    : "زمان نامعلوم";
  const reference = payment ? assumption.obligation_id : assumption.invoice_ref;
  const history =
    assumption.basis === "amount_weighted_median_delay" &&
    assumption.history_event_count != null
      ? `؛ بر پایه ${persian(assumption.history_event_count)} وصول`
      : "";
  return `${payment ? "پرداخت" : "وصول"} ${reference || ""} در ${date}${history}`;
}
