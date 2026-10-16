import { Badge } from "@/components/ui/badge";
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
    className: "bg-primary/10 text-primary border-primary/20",
  },
  rule: {
    label: "قاعده سیستمی",
    icon: ShieldCheck,
    className: "bg-ds-warning/10 text-ds-warning border-ds-warning/20",
  },
  system: {
    label: "محاسبه سیستم",
    icon: ShieldCheck,
    className: "bg-muted text-muted-foreground border-border",
  },
  file: {
    label: "فایل ورودی",
    icon: FileText,
    className: "bg-primary/10 text-primary border-primary/20",
  },
};


const tagIconSizes: Record<NonNullable<EvidenceSourceTagProps["size"]>, string> = {
  xs: "size-2.5 shrink-0",
  sm: "size-3 shrink-0",
  md: "size-3.5 shrink-0",
};

export const EvidenceSourceTag = React.forwardRef<HTMLSpanElement, EvidenceSourceTagProps>(
  ({ source, label, detail, size = "md", showIcon = true, className, ...props }, ref) => {
    const config = Object.hasOwn(sourceConfig, source) ? sourceConfig[source] : {
      label: "منبع نامشخص",
      icon: FileText,
      className: "bg-muted text-muted-foreground border-border",
    };
    const Icon = config.icon;
    const displayLabel = label ?? config.label;

    return (
      <Badge
        variant="outline"
        size={size === "md" ? "default" : size}
        ref={ref}
        className={cn(
          config.className,
          className
        )}
        {...props}
      >
        {showIcon && <Icon className={tagIconSizes[size]} aria-hidden="true" />}
        <span>{displayLabel}</span>
        {detail && <span className="font-mono text-[0.88em] opacity-80 border-s border-current/25 ps-1.5 ms-0.5">{detail}</span>}
      </Badge>
    );
  }
);

EvidenceSourceTag.displayName = "EvidenceSourceTag";
