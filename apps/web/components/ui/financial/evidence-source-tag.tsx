import React from "react";
import { BookOpen, Building2, FileSpreadsheet, Receipt, ShieldCheck, FileText } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export type EvidenceSourceType = "accounting" | "bank" | "sales" | "tax" | "rule" | "system" | "file";

export interface EvidenceSourceTagProps extends React.HTMLAttributes<HTMLSpanElement> {
  source: EvidenceSourceType | string;
  label?: string;
  detail?: string;
  size?: "xs" | "sm" | "md";
  showIcon?: boolean;
}

const sourceConfig: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  accounting: {
    label: "دفتر حسابداری",
    icon: BookOpen,
    className: "bg-primary/10 text-primary border-primary/20",
  },
  bank: {
    label: "گردش حساب بانکی",
    icon: Building2,
    className: "bg-ds-success/10 text-ds-success border-ds-success/20",
  },
  sales: {
    label: "فاکتور فروش",
    icon: Receipt,
    className: "bg-primary/10 text-primary border-primary/20",
  },
  tax: {
    label: "سامانه مودیان",
    icon: FileSpreadsheet,
    className: "bg-teal-500/10 text-teal-700 border-teal-500/20",
  },
  rule: {
    label: "قاعده سیستمی",
    icon: ShieldCheck,
    className: "bg-ds-warning/10 text-ds-warning border-ds-warning/20",
  },
  system: {
    label: "محاسبه سیستم",
    icon: ShieldCheck,
    className: "bg-slate-500/10 text-slate-700 border-slate-500/20",
  },
  file: {
    label: "فایل ورودی",
    icon: FileText,
    className: "bg-primary/10 text-primary border-primary/20",
  },
};

const tagSizes: Record<NonNullable<EvidenceSourceTagProps["size"]>, string> = {
  xs: "text-[10px] px-1.5 py-0 gap-1 rounded",
  sm: "text-[11px] px-2 py-0.5 gap-1 rounded-md",
  md: "text-xs px-2.5 py-1 gap-1.5 rounded-md",
};

const tagIconSizes: Record<NonNullable<EvidenceSourceTagProps["size"]>, string> = {
  xs: "size-2.5 shrink-0",
  sm: "size-3 shrink-0",
  md: "size-3.5 shrink-0",
};

export const EvidenceSourceTag = React.forwardRef<HTMLSpanElement, EvidenceSourceTagProps>(
  ({ source, label, detail, size = "md", showIcon = true, className, ...props }, ref) => {
    const config = sourceConfig[source] ?? {
      label: source,
      icon: FileText,
      className: "bg-slate-500/10 text-slate-700 border-slate-500/20",
    };
    const Icon = config.icon;
    const displayLabel = label ?? config.label;

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center border font-bold select-none whitespace-nowrap transition-colors",
          tagSizes[size],
          config.className,
          className
        )}
        {...props}
      >
        {showIcon && <Icon className={tagIconSizes[size]} aria-hidden="true" />}
        <span>{displayLabel}</span>
        {detail && <span className="font-mono text-[0.88em] opacity-80 border-s border-current/25 ps-1.5 ms-0.5">{detail}</span>}
      </span>
    );
  }
);

EvidenceSourceTag.displayName = "EvidenceSourceTag";
