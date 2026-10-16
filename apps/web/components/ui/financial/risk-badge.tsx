import { Badge } from "@/components/ui/badge";
import React from "react";
import { AlertCircle, AlertTriangle, Info, ShieldAlert } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "./money-display";

export type RiskLevel = "critical" | "high" | "medium" | "low";

export interface RiskBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  level: RiskLevel | string;
  score?: number | null;
  label?: string;
  showIcon?: boolean;
  showDot?: boolean;
  pulse?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
}

const riskConfig: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    bgClass: string;
    textClass: string;
    borderClass: string;
  }
> = {
  critical: {
    label: "ریسک بحرانی",
    icon: ShieldAlert,
    bgClass: "bg-[var(--ds-risk-critical-bg)]",
    textClass: "text-[var(--ds-risk-critical-fg)]",
    borderClass: "border-[var(--ds-risk-critical-border)]",
  },
  high: {
    label: "ریسک بالا",
    icon: AlertCircle,
    bgClass: "bg-[var(--ds-risk-high-bg)]",
    textClass: "text-[var(--ds-risk-high-fg)]",
    borderClass: "border-[var(--ds-risk-high-border)]",
  },
  medium: {
    label: "ریسک متوسط",
    icon: AlertTriangle,
    bgClass: "bg-[var(--ds-risk-medium-bg)]",
    textClass: "text-[var(--ds-risk-medium-fg)]",
    borderClass: "border-[var(--ds-risk-medium-border)]",
  },
  low: {
    label: "ریسک پایین",
    icon: Info,
    bgClass: "bg-[var(--ds-risk-low-bg)]",
    textClass: "text-[var(--ds-risk-low-fg)]",
    borderClass: "border-[var(--ds-risk-low-border)]",
  },
};


const iconSizes: Record<NonNullable<RiskBadgeProps["size"]>, string> = {
  xs: "size-2.5 shrink-0",
  sm: "size-3 shrink-0",
  md: "size-3.5 shrink-0",
  lg: "size-4 shrink-0",
};

export const RiskBadge = React.forwardRef<HTMLSpanElement, RiskBadgeProps>(
  ({ level, score, label, showIcon = true, showDot = false, pulse = false, size = "md", className, ...props }, ref) => {
    const config = Object.hasOwn(riskConfig, level) ? riskConfig[level] : { ...riskConfig.low, label: "نامشخص", bgClass: "bg-muted", textClass: "text-muted-foreground", borderClass: "border-border" };
    const Icon = config.icon;
    const displayLabel = label ?? config.label;

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
          <Icon className={cn(iconSizes[size], "transition-transform duration-200 ")} aria-hidden="true" />
        )}
        <span>{displayLabel}</span>
        {score !== undefined && score !== null && (
          <span className="font-mono text-[0.88em] opacity-80 border-s border-current/20 ps-1.5 ms-0.5">
            {toPersianDigits(Math.round(score))}
          </span>
        )}
      </Badge>
    );
  }
);

RiskBadge.displayName = "RiskBadge";
