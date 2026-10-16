import { Badge } from "@/components/ui/badge";
import React from "react";
import {
  CheckCircle2,
  Sparkles,
  Clock,
  HelpCircle,
  XCircle,
  AlertCircle,
  RefreshCcw,
  CheckCheck,
  ShieldAlert,
  ShieldCheck,
  FileCheck2,
  PlayCircle,
  Ban,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export type DomainStatus =
  // Lifecycle & Workflow
  | "new"
  | "needs_review"
  | "in_progress"
  | "resolved"
  | "verified"
  | "dismissed"
  | "reopened"
  | "follow_up"
  // Job / Import / Processing
  | "queued"
  | "processing"
  | "completed"
  | "completed_limited"
  | "failed"
  | "ready"
  // Reconciliation matching
  | "auto_matched"
  | "potential_match"
  | "suggested_match"
  | "confirmed"
  | "reversed"
  | "unmatched_bank"
  | "unmatched_journal"
  | "amount_mismatch"
  | "date_mismatch"
  | "duplicate"
  // Risk & Criticality
  | "critical"
  | "high"
  | "medium"
  | "low"
  // System Data
  | "active"
  | "stale"
  | "healthy";

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: DomainStatus | string;
  label?: string;
  size?: "xs" | "sm" | "md";
  showIcon?: boolean;
  showDot?: boolean;
  pulse?: boolean;
}

interface StatusConfig {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

const statusConfigs: Record<string, StatusConfig> = {
  // New / Fresh
  new: {
    label: "جدید",
    icon: PlayCircle,
    bgClass: "bg-primary/10",
    textClass: "text-primary",
    borderClass: "border-primary/30",
  },
  // Needs Review
  needs_review: {
    label: "نیازمند بررسی",
    icon: HelpCircle,
    bgClass: "bg-ds-warning/10",
    textClass: "text-ds-warning",
    borderClass: "border-ds-warning/30",
  },
  potential_match: {
    label: "نیازمند بررسی",
    icon: HelpCircle,
    bgClass: "bg-ds-warning/10",
    textClass: "text-ds-warning",
    borderClass: "border-ds-warning/30",
  },
  suggested_match: {
    label: "پیشنهاد تطبیق",
    icon: SparkleIcon,
    bgClass: "bg-primary/10",
    textClass: "text-primary",
    borderClass: "border-primary/30",
  },
  // In Progress
  in_progress: {
    label: "در حال پیگیری",
    icon: Clock,
    bgClass: "bg-primary/10",
    textClass: "text-primary",
    borderClass: "border-primary/30",
  },
  follow_up: {
    label: "در حال پیگیری",
    icon: Clock,
    bgClass: "bg-primary/10",
    textClass: "text-primary",
    borderClass: "border-primary/30",
  },
  processing: {
    label: "در حال پردازش",
    icon: RefreshCcw,
    bgClass: "bg-primary/10",
    textClass: "text-primary",
    borderClass: "border-primary/30",
  },
  queued: {
    label: "در صف انتظار",
    icon: Clock,
    bgClass: "bg-muted/80",
    textClass: "text-muted-foreground",
    borderClass: "border-border",
  },
  // Resolved / Cleared
  resolved: {
    label: "رفع‌شده",
    icon: CheckCircle2,
    bgClass: "bg-ds-success/10",
    textClass: "text-ds-success",
    borderClass: "border-ds-success/30",
  },
  auto_matched: {
    label: "تطبیق قطعی",
    icon: CheckCheck,
    bgClass: "bg-ds-success/10",
    textClass: "text-ds-success",
    borderClass: "border-ds-success/30",
  },
  // Verified (Maker-Checker approved)
  verified: {
    label: "صحه‌گذاری‌شده",
    icon: ShieldCheck,
    bgClass: "bg-teal-500/10",
    textClass: "text-teal-700",
    borderClass: "border-teal-500/30",
  },
  confirmed: {
    label: "تاییدشده",
    icon: ShieldCheck,
    bgClass: "bg-teal-500/10",
    textClass: "text-teal-700",
    borderClass: "border-teal-500/30",
  },
  completed: {
    label: "تکمیل‌شده",
    icon: CheckCircle2,
    bgClass: "bg-ds-success/10",
    textClass: "text-ds-success",
    borderClass: "border-ds-success/30",
  },
  completed_limited: {
    label: "تکمیل با هشدار",
    icon: AlertCircle,
    bgClass: "bg-ds-warning/10",
    textClass: "text-ds-warning",
    borderClass: "border-ds-warning/30",
  },
  ready: {
    label: "آماده",
    icon: CheckCircle2,
    bgClass: "bg-ds-success/10",
    textClass: "text-ds-success",
    borderClass: "border-ds-success/30",
  },
  // Dismissed / Rejected / Reversed
  dismissed: {
    label: "رد شده",
    icon: Ban,
    bgClass: "bg-muted/70",
    textClass: "text-muted-foreground",
    borderClass: "border-border",
  },
  reversed: {
    label: "ابطال‌شده",
    icon: RefreshCcw,
    bgClass: "bg-ds-warning/10",
    textClass: "text-ds-warning",
    borderClass: "border-ds-warning/30",
  },
  reopened: {
    label: "بازگشایی‌شده",
    icon: RefreshCcw,
    bgClass: "bg-ds-warning/10",
    textClass: "text-ds-warning",
    borderClass: "border-ds-warning/30",
  },
  failed: {
    label: "ناموفق",
    icon: XCircle,
    bgClass: "bg-ds-danger/10",
    textClass: "text-ds-danger",
    borderClass: "border-ds-danger/30",
  },
  // Mismatches
  unmatched_bank: {
    label: "فاقد سند در دفاتر",
    icon: XCircle,
    bgClass: "bg-ds-danger/10",
    textClass: "text-ds-danger",
    borderClass: "border-ds-danger/30",
  },
  unmatched_journal: {
    label: "فاقد گردش در بانک",
    icon: XCircle,
    bgClass: "bg-ds-warning/10",
    textClass: "text-ds-warning",
    borderClass: "border-ds-warning/30",
  },
  amount_mismatch: {
    label: "مغایرت مبلغ",
    icon: AlertCircle,
    bgClass: "bg-ds-danger/10",
    textClass: "text-ds-danger",
    borderClass: "border-ds-danger/30",
  },
  date_mismatch: {
    label: "مغایرت تاریخ",
    icon: Clock,
    bgClass: "bg-ds-warning/10",
    textClass: "text-ds-warning",
    borderClass: "border-ds-warning/30",
  },
  duplicate: {
    label: "تکراری",
    icon: RefreshCcw,
    bgClass: "bg-primary/10",
    textClass: "text-primary",
    borderClass: "border-primary/30",
  },
  // Severity
  critical: {
    label: "بحرانی",
    icon: ShieldAlert,
    bgClass: "bg-ds-danger/15",
    textClass: "text-ds-danger font-bold",
    borderClass: "border-ds-danger/40",
  },
  high: {
    label: "بالا",
    icon: AlertCircle,
    bgClass: "bg-ds-warning/15",
    textClass: "text-ds-warning font-bold",
    borderClass: "border-ds-warning/40",
  },
  medium: {
    label: "متوسط",
    icon: HelpCircle,
    bgClass: "bg-primary/10",
    textClass: "text-primary",
    borderClass: "border-primary/30",
  },
  low: {
    label: "پایین",
    icon: Clock,
    bgClass: "bg-muted/70",
    textClass: "text-muted-foreground",
    borderClass: "border-border",
  },
};

const additionalStatuses: Record<string, [string, string]> = {
  active: ["فعال", "completed"],
  healthy: ["سالم", "completed"],
  connected: ["متصل", "completed"],
  stale: ["قدیمی", "completed_limited"],
  uploaded: ["دریافت شد", "queued"],
  inspecting: ["در حال بررسی امنیتی", "processing"],
  awaiting_mapping: ["آماده تأیید ستون‌ها", "needs_review"],
  validating: ["در حال اعتبارسنجی", "processing"],
  cancelled: ["لغوشده", "dismissed"],
  triaged: ["بررسی اولیه", "needs_review"],
  syncing: ["در حال دریافت", "processing"],
  reauth_required: ["نیازمند احراز هویت", "needs_review"],
  error: ["خطا", "failed"],
  inactive: ["غیرفعال", "dismissed"],
  disconnected: ["قطع‌شده", "dismissed"],
  running: ["در حال اجرا", "processing"],
  partial: ["دریافت ناقص", "completed_limited"],
  fully_allocated: ["تخصیص کامل", "completed"],
  partially_allocated: ["تخصیص جزئی", "completed_limited"],
  unallocated: ["بدون تخصیص", "queued"],
};
for (const [status, [label, tone]] of Object.entries(additionalStatuses)) {
  statusConfigs[status] = { ...statusConfigs[tone], label };
}

function SparkleIcon({ className }: { className?: string }) {
  return <Sparkles aria-hidden="true" className={className} />;
}


export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  (
    {
      status,
      label,
      size = "sm",
      showIcon = true,
      showDot = false,
      pulse = false,
      className,
      ...props
    },
    ref
  ) => {
    const config = Object.hasOwn(statusConfigs, status) ? statusConfigs[status] : {
      label: label || "نامشخص",
      icon: HelpCircle,
      bgClass: "bg-muted",
      textClass: "text-muted-foreground",
      borderClass: "border-border",
    };

    const displayLabel = label || config.label;
    const IconComponent = config.icon;

    return (
      <Badge
        variant="outline"
        dot={showDot}
        pulse={pulse}
        size={size === "md" ? "default" : size}
        ref={ref}
        className={cn(
          config.bgClass,
          config.textClass,
          config.borderClass,
          className
        )}
        {...props}
      >
        {showIcon && !showDot && (
          <IconComponent aria-hidden="true" className="size-3.5 shrink-0 transition-transform duration-200 " />
        )}
        <span className="min-w-0 leading-relaxed">{displayLabel}</span>
      </Badge>
    );
  }
);

StatusBadge.displayName = "StatusBadge";
