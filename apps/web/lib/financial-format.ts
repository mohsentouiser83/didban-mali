import { toPersianDigits } from "./date-utils";
import { toman } from "./cashflow-amounts";

export function formatFinancialNumber(num: number | string | bigint): string {
  if (typeof num === "bigint") return formatFinancialNumber(num.toString());
  if (num === null || num === undefined || num === "") return "—";

  if (typeof num === "string") {
    const trimmed = num.trim();
    if (!trimmed || isNaN(Number(trimmed))) return trimmed;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return trimmed;
    if (trimmed.toLowerCase().includes("e")) {
      const isNeg = n < 0;
      const abs = Math.abs(n);
      const formatted = abs.toLocaleString("en-US", {
        maximumFractionDigits: 2,
      });
      const persianFormatted = toPersianDigits(
        formatted.replace(/,/g, "٬").replace(/\./g, "٫"),
      );
      return isNeg ? `${persianFormatted}−` : persianFormatted;
    }
    const parts = trimmed.split(".");
    const integerPart = parts[0]?.replace(/\B(?=(\d{3})+(?!\d))/g, "٬") ?? "0";
    const fraction = parts[1]?.replace(/0+$/, "");
    if (fraction) {
      return toPersianDigits(`${integerPart}٫${fraction}`);
    }
    return toPersianDigits(integerPart);
  }

  const n = num;
  const isNegative = n < 0;
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const persianFormatted = toPersianDigits(
    formatted.replace(/,/g, "٬").replace(/\./g, "٫"),
  );
  return isNegative ? `${persianFormatted}−` : persianFormatted;
}

/** Full hint text preserves original precision; abbreviated values stay in the view. */
export function formatMoneyTooltip(amount: number | string | bigint, currency: string): string {
  const exact = formatFinancialNumber(amount);
  if (currency !== "ریال" && currency !== "IRR") return `${exact} ${currency}`;
  try {
    return `${exact} ریال (${formatFinancialNumber(toman(String(amount)))} تومان)`;
  } catch {
    // Fractional/non-integral rial inputs cannot use the integer-rial conversion.
    return `${exact} ریال`;
  }
}
