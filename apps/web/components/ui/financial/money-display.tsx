import React from "react";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/date-utils";

export { toPersianDigits };

export type FinancialUnit =
  | "rial"
  | "toman"
  | "million_toman"
  | "billion_toman"
  | "percent"
  | "auto";

export interface MoneyDisplayProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  amount: number | string | bigint | null | undefined;
  currency?:
    | "ریال"
    | "تومان"
    | "میلیارد تومان"
    | "میلیون تومان"
    | "میلیارد ریال"
    | "همت"
    | "درصد"
    | "٪"
    | ""
    | string;
  direction?: "auto" | "positive" | "negative" | "neutral";
  showSign?: boolean;
  compact?: boolean;
  executive?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  subdued?: boolean;
  highlightZero?: boolean;
}

export function formatFinancialNumber(num: number | string | bigint): string {
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

  const n = typeof num === "bigint" ? Number(num) : num;
  const isNegative = n < 0;
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const persianFormatted = toPersianDigits(
    formatted.replace(/,/g, "٬").replace(/\./g, "٫"),
  );
  return isNegative ? `${persianFormatted}−` : persianFormatted;
}

const sizeClasses: Record<NonNullable<MoneyDisplayProps["size"]>, string> = {
  xs: "text-xs font-semibold",
  sm: "text-sm font-semibold",
  md: "text-base font-bold",
  lg: "text-lg font-bold",
  xl: "text-xl font-bold tracking-normal",
  "2xl": "text-2xl lg:text-3xl font-bold tracking-normal",
};

export const MoneyDisplay = React.forwardRef<
  HTMLSpanElement,
  MoneyDisplayProps
>(
  (
    {
      amount,
      currency = "ریال",
      direction = "auto",
      showSign = false,
      compact = false,
      executive = false,
      size = "md",
      subdued = false,
      highlightZero = false,
      className,
      title,
      ...props
    },
    ref,
  ) => {
    // 1. Handle No Data State (Dash with proper explanation)
    if (amount === null || amount === undefined || amount === "") {
      return (
        <span
          ref={ref}
          className={cn(
            "inline-flex items-center font-mono text-muted-foreground select-none",
            sizeClasses[size],
            className,
          )}
          title={title ?? "داده‌ای در دسترس نیست"}
          {...props}
        >
          —
        </span>
      );
    }

    const numericVal =
      typeof amount === "string" ? parseFloat(amount) : Number(amount);
    if (isNaN(numericVal)) {
      return (
        <span
          ref={ref}
          className={cn(
            "inline-flex items-center font-mono text-muted-foreground",
            sizeClasses[size],
            className,
          )}
          {...props}
        >
          {String(amount)}
        </span>
      );
    }

    const isZero = numericVal === 0;
    const isNegative = numericVal < 0;

    let resolvedDirection = direction;
    if (direction === "auto") {
      if (isNegative) resolvedDirection = "negative";
      else if (numericVal > 0) resolvedDirection = "positive";
      else resolvedDirection = "neutral";
    }

    let colorClass = "text-foreground";
    if (resolvedDirection === "positive") {
      colorClass = "text-ds-success";
    } else if (resolvedDirection === "negative") {
      colorClass = "text-ds-danger";
    } else if (subdued || (isZero && !highlightZero)) {
      colorClass = "text-muted-foreground";
    }

    let rawDisplay = formatFinancialNumber(amount);
    let resolvedCurrency = currency;

    const absVal = Math.abs(numericVal);

    // 2. Executive / Compact Smart Unit conversion
    if ((compact || executive) && !isNaN(numericVal)) {
      if (currency === "ریال" || currency === "IRR") {
        const tomanVal = numericVal / 10;
        const absToman = Math.abs(tomanVal);
        if (absToman >= 1_000_000_000) {
          rawDisplay = toPersianDigits(
            (tomanVal / 1_000_000_000).toFixed(1).replace(".", "٫"),
          );
          resolvedCurrency = "میلیارد تومان";
        } else if (absToman >= 1_000_000) {
          rawDisplay = toPersianDigits(
            (tomanVal / 1_000_000).toFixed(1).replace(".", "٫"),
          );
          resolvedCurrency = "میلیون تومان";
        } else if (absToman >= 1_000) {
          rawDisplay = toPersianDigits(
            Math.round(tomanVal).toLocaleString("fa-IR"),
          );
          resolvedCurrency = "تومان";
        }
      } else if (currency === "تومان") {
        if (absVal >= 1_000_000_000) {
          rawDisplay = toPersianDigits(
            (numericVal / 1_000_000_000).toFixed(1).replace(".", "٫"),
          );
          resolvedCurrency = "میلیارد تومان";
        } else if (absVal >= 1_000_000) {
          rawDisplay = toPersianDigits(
            (numericVal / 1_000_000).toFixed(1).replace(".", "٫"),
          );
          resolvedCurrency = "میلیون تومان";
        }
      }
    }

    const signPrefix = showSign && numericVal > 0 ? "+" : "";

    // 3. Computed legal full precision for tooltip
    const computedTooltip =
      title ??
      (currency === "ریال" || currency === "IRR"
        ? `${formatFinancialNumber(amount)} ریال (${formatFinancialNumber(Math.round(numericVal / 10))} تومان)`
        : `${formatFinancialNumber(amount)} ${currency}`);

    return (
      <span
        ref={ref}
        dir="ltr"
        title={computedTooltip}
        className={cn(
          "inline-flex items-baseline gap-1.5 font-mono cursor-default [font-variant-numeric:tabular-nums_lining-nums]",
          sizeClasses[size],
          colorClass,
          className,
        )}
        {...props}
      >
        {resolvedCurrency && (
          <span className="text-[0.78em] font-normal tracking-normal text-muted-foreground select-none">
            {resolvedCurrency}
          </span>
        )}
        <span className="inline-block font-bold">
          {signPrefix}
          {rawDisplay}
        </span>
      </span>
    );
  },
);

MoneyDisplay.displayName = "MoneyDisplay";
