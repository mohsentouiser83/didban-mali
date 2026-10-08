import React from "react";
import { CheckCircle2, Clock, HelpCircle, XCircle, AlertCircle, RefreshCcw, CheckCheck, Ban, Sparkles } from "@/components/ui/icons";
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
    className: "bg-ds-success/10 text-ds-success border-ds-success/25",
  },
  potential_match: {
    label: "نیازمند بررسی",
    icon: HelpCircle,
    className: "bg-ds-warning/10 text-ds-warning border-ds-warning/25",
  },
  needs_review: {
    label: "نیازمند بررسی",
    icon: HelpCircle,
    className: "bg-ds-warning/10 text-ds-warning border-ds-warning/25",
  },
  in_review: {
    label: "در حال بررسی",
    icon: Clock,
    className: "bg-primary/10 text-primary border-primary/25",
  },
  investigating: {
    label: "در حال بررسی",
    icon: Clock,
    className: "bg-primary/10 text-primary border-primary/25",
  },
  hypothesis: {
    label: "فرضیه (غیرقطعی)",
    icon: HelpCircle,
    className: "bg-primary/10 text-primary border-primary/25",
  },
  deterministic: {
    label: "یافته قطعی",
    icon: CheckCircle2,
    className: "bg-ds-success/10 text-ds-success border-ds-success/25",
  },
  amount_mismatch: {
    label: "مغایرت مبلغ",
    icon: AlertCircle,
    className: "bg-ds-danger/10 text-ds-danger border-ds-danger/25",
  },
  date_mismatch: {
    label: "مغایرت تاریخ",
    icon: Clock,
    className: "bg-ds-warning/10 text-ds-warning border-ds-warning/25",
  },
  unmatched_bank: {
    label: "فاقد سند در حسابداری",
    icon: XCircle,
    className: "bg-ds-danger/10 text-ds-danger border-ds-danger/25",
  },
  unmatched_accounting: {
    label: "فاقد تراکنش در بانک",
    icon: XCircle,
    className: "bg-ds-danger/10 text-ds-danger border-ds-danger/25",
  },
  duplicate: {
    label: "تراکنش تکراری",
    icon: RefreshCcw,
    className: "bg-primary/10 text-primary border-primary/25",
  },
  confirmed: {
    label: "تأییدشده توسط مشاور",
    icon: CheckCircle2,
    className: "bg-primary/10 text-primary border-primary/25",
  },
  follow_up: {
    label: "در حال پیگیری",
    icon: Clock,
    className: "bg-ds-warning/10 text-ds-warning border-ds-warning/25",
  },
  resolved: {
    label: "حل و نهایی‌شده",
    icon: CheckCheck,
    className: "bg-ds-success/10 text-ds-success border-ds-success/25",
  },
  dismissed: {
    label: "ردشده / بی‌اثر",
    icon: Ban,
    className: "bg-slate-500/10 text-slate-600 border-slate-500/25",
  },
  processing: {
    label: "در حال پردازش",
    icon: RefreshCcw,
    className: "bg-primary/10 text-primary border-primary/25",
  },
  queued: {
    label: "در صف پردازش",
    icon: Clock,
    className: "bg-slate-500/10 text-slate-700 border-slate-500/25",
  },
  completed: {
    label: "تکمیل‌شده",
    icon: CheckCheck,
    className: "bg-ds-success/10 text-ds-success border-ds-success/25",
  },
  completed_limited: {
    label: "تکمیل‌شده (محدود)",
    icon: AlertCircle,
    className: "bg-ds-warning/10 text-ds-warning border-ds-warning/25",
  },
  failed: {
    label: "ناموفق",
    icon: XCircle,
    className: "bg-ds-danger/10 text-ds-danger border-ds-danger/25",
  },
  ready: {
    label: "آماده",
    icon: Sparkles,
    className: "bg-ds-success/10 text-ds-success border-ds-success/25",
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
          props.onClick && "cursor-pointer",
          sizeClasses[size],
          def.className,
          className
        )}
        {...props}
      >
        {isPulsing ? (
          <span className="size-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
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
