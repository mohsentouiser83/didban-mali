import React from "react";
import { cn } from "@/lib/utils";

export interface MoneyDisplayProps extends React.HTMLAttributes<HTMLSpanElement> {
  amount: number | string | bigint | null | undefined;
  currency?: "ریال" | "تومان" | "میلیارد ریال" | "همت" | "درصد" | "٪" | "" | string;
  direction?: "auto" | "positive" | "negative" | "neutral";
  showSign?: boolean;
  compact?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  subdued?: boolean;
  highlightZero?: boolean;
}

const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => persianDigits[parseInt(d, 10)] ?? d);
}

export function formatFinancialNumber(num: number | string | bigint): string {
  if (typeof num === "string") {
    const trimmed = num.trim();
    if (!trimmed || isNaN(Number(trimmed))) return trimmed;
    const parts = trimmed.split(".");
    const integerPart = parts[0]?.replace(/\B(?=(\d{3})+(?!\d))/g, "٬") ?? "0";
    if (parts.length > 1 && parts[1]) {
      return toPersianDigits(`${integerPart}٫${parts[1]}`);
    }
    return toPersianDigits(integerPart);
  }

  const n = typeof num === "bigint" ? Number(num) : num;
  const isNegative = n < 0;
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const persianFormatted = toPersianDigits(formatted.replace(/,/g, "٬").replace(/\./g, "٫"));
  return isNegative ? `${persianFormatted}−` : persianFormatted;
}

const sizeClasses: Record<NonNullable<MoneyDisplayProps["size"]>, string> = {
  xs: "text-xs font-semibold",
  sm: "text-sm font-semibold",
  md: "text-base font-bold",
  lg: "text-lg font-bold",
  xl: "text-xl font-extrabold tracking-tight",
  "2xl": "text-2xl lg:text-3xl font-extrabold tracking-tight",
};

export const MoneyDisplay = React.forwardRef<HTMLSpanElement, MoneyDisplayProps>(
  (
    {
      amount,
      currency = "ریال",
      direction = "auto",
      showSign = false,
      compact = false,
      size = "md",
      subdued = false,
      highlightZero = false,
      className,
      ...props
    },
    ref
  ) => {
    if (amount === null || amount === undefined || amount === "") {
      return (
        <span
          ref={ref}
          className={cn("inline-flex items-center font-mono text-muted-foreground", sizeClasses[size], className)}
          {...props}
        >
          —
        </span>
      );
    }

    const numericVal = typeof amount === "string" ? parseFloat(amount) : Number(amount);
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
      colorClass = "text-[var(--ds-fin-inflow-fg)]";
    } else if (resolvedDirection === "negative") {
      colorClass = "text-[var(--ds-fin-outflow-fg)]";
    } else if (subdued || (isZero && !highlightZero)) {
      colorClass = "text-muted-foreground";
    }

    let rawDisplay = formatFinancialNumber(amount);
    let resolvedCurrency = currency;

    if (compact && typeof numericVal === "number" && !isNaN(numericVal)) {
      const absVal = Math.abs(numericVal);
      if (absVal >= 1_000_000_000_000) {
        rawDisplay = toPersianDigits((numericVal / 1_000_000_000_000).toFixed(1).replace(".", "٫"));
        resolvedCurrency = "همت";
      } else if (absVal >= 1_000_000_000) {
        rawDisplay = toPersianDigits((numericVal / 1_000_000_000).toFixed(1).replace(".", "٫"));
        resolvedCurrency = "میلیارد ریال";
      } else if (absVal >= 1_000_000) {
        rawDisplay = toPersianDigits((numericVal / 1_000_000).toFixed(1).replace(".", "٫"));
        resolvedCurrency = "میلیون ریال";
      }
    }

    const signPrefix = showSign && numericVal > 0 ? "+" : "";

    return (
      <span
        ref={ref}
        dir="ltr"
        className={cn(
          "inline-flex items-baseline gap-1 font-mono [font-variant-numeric:tabular-nums_lining-nums]",
          sizeClasses[size],
          colorClass,
          className
        )}
        {...props}
      >
        {resolvedCurrency && (
          <span className="text-[0.78em] font-normal tracking-normal text-muted-foreground select-none">
            {resolvedCurrency}
          </span>
        )}
        <span className="inline-block">
          {signPrefix}
          {rawDisplay}
        </span>
      </span>
    );
  }
);

MoneyDisplay.displayName = "MoneyDisplay";
