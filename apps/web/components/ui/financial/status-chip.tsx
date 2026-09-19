import React from "react";
import { CheckCircle2, Clock, HelpCircle, XCircle, AlertCircle, RefreshCcw, CheckCheck, Ban, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type FinancialStatus =
  | "exact_match"
  | "potential_match"
  | "amount_mismatch"
  | "date_mismatch"
  | "unmatched_bank"
  | "unmatched_accounting"
  | "duplicate"
  | "confirmed"
  | "follow_up"
  | "resolved"
  | "dismissed"
  | "processing"
  | "ready";

export interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: FinancialStatus | string;
  label?: string;
  size?: "xs" | "sm" | "md" | "lg";
  showIcon?: boolean;
  pulse?: boolean;
}

const statusDefinitions: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  exact_match: {
    label: "تطبیق قطعی ۱۰۰٪",
    icon: CheckCheck,
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:text-emerald-400 dark:border-emerald-500/30",
  },
  potential_match: {
    label: "کاندید نیازمند بررسی",
    icon: HelpCircle,
    className: "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-400 dark:border-amber-500/30",
  },
  amount_mismatch: {
    label: "مغایرت مبلغ",
    icon: AlertCircle,
    className: "bg-red-500/10 text-red-600 border-red-500/25 dark:text-red-400 dark:border-red-500/30",
  },
  date_mismatch: {
    label: "مغایرت تاریخ",
    icon: Clock,
    className: "bg-orange-500/10 text-orange-700 border-orange-500/25 dark:text-orange-400 dark:border-orange-500/30",
  },
  unmatched_bank: {
    label: "فاقد سند در حسابداری",
    icon: XCircle,
    className: "bg-rose-500/10 text-rose-600 border-rose-500/25 dark:text-rose-400 dark:border-rose-500/30",
  },
  unmatched_accounting: {
    label: "فاقد تراکنش در بانک",
    icon: XCircle,
    className: "bg-rose-500/10 text-rose-600 border-rose-500/25 dark:text-rose-400 dark:border-rose-500/30",
  },
  duplicate: {
    label: "تراکنش تکراری",
    icon: RefreshCcw,
    className: "bg-purple-500/10 text-purple-700 border-purple-500/25 dark:text-purple-400 dark:border-purple-500/30",
  },
  confirmed: {
    label: "تأییدشده توسط مشاور",
    icon: CheckCircle2,
    className: "bg-blue-500/10 text-blue-700 border-blue-500/25 dark:text-blue-400 dark:border-blue-500/30",
  },
  follow_up: {
    label: "در حال پیگیری",
    icon: Clock,
    className: "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-400 dark:border-amber-500/30",
  },
  resolved: {
    label: "حل و نهایی‌شده",
    icon: CheckCheck,
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:text-emerald-400 dark:border-emerald-500/30",
  },
  dismissed: {
    label: "ردشده / بی‌اثر",
    icon: Ban,
    className: "bg-slate-500/10 text-slate-600 border-slate-500/25 dark:text-slate-400 dark:border-slate-500/30",
  },
  processing: {
    label: "در حال پردازش",
    icon: RefreshCcw,
    className: "bg-cyan-500/10 text-cyan-700 border-cyan-500/25 dark:text-cyan-400 dark:border-cyan-500/30",
  },
  ready: {
    label: "آماده",
    icon: Sparkles,
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:text-emerald-400 dark:border-emerald-500/30",
  },
};

const sizeClasses: Record<NonNullable<StatusChipProps["size"]>, string> = {
  xs: "text-[10.5px] px-1.5 py-0 gap-1 rounded",
  sm: "text-xs px-2 py-0.5 gap-1 rounded-md",
  md: "text-xs px-2.5 py-1 gap-1.5 rounded-md",
  lg: "text-sm px-3.5 py-1.5 gap-2 rounded-lg",
};

const iconSizes: Record<NonNullable<StatusChipProps["size"]>, string> = {
  xs: "size-2.5 shrink-0",
  sm: "size-3 shrink-0",
  md: "size-3.5 shrink-0",
  lg: "size-4 shrink-0",
};

export const StatusChip = React.forwardRef<HTMLSpanElement, StatusChipProps>(
  ({ status, label, size = "md", showIcon = true, pulse = false, className, ...props }, ref) => {
    const def = statusDefinitions[status] ?? {
      label: status,
      icon: InfoIconFallback,
      className: "bg-slate-500/10 text-slate-600 border-slate-500/20",
    };
    const Icon = def.icon;
    const text = label ?? def.label;
    const isPulsing = pulse || status === "processing";

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center border font-bold select-none whitespace-nowrap transition-colors",
          sizeClasses[size],
          def.className,
          className
        )}
        {...props}
      >
        {isPulsing ? (
          <span className="size-1.5 rounded-full bg-current shrink-0 animate-pulse" aria-hidden="true" />
        ) : (
          showIcon && <Icon className={iconSizes[size]} aria-hidden="true" />
        )}
        <span>{text}</span>
      </span>
    );
  }
);

function InfoIconFallback({ className }: { className?: string }) {
  return <HelpCircle className={className} />;
}

StatusChip.displayName = "StatusChip";
