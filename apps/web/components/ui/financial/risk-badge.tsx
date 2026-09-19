import React from "react";
import { AlertCircle, AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "./money-display";

export type RiskLevel = "critical" | "high" | "medium" | "low";

export interface RiskBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  level: RiskLevel;
  score?: number | null;
  label?: string;
  showIcon?: boolean;
  showDot?: boolean;
  pulse?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
}

const riskConfig: Record<
  RiskLevel,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    bgClass: string;
    textClass: string;
    borderClass: string;
    dotClass: string;
  }
> = {
  critical: {
    label: "ریسک بحرانی",
    icon: ShieldAlert,
    bgClass: "bg-[var(--ds-risk-critical-bg)]",
    textClass: "text-[var(--ds-risk-critical-fg)]",
    borderClass: "border-[var(--ds-risk-critical-border)]",
    dotClass: "bg-red-500",
  },
  high: {
    label: "ریسک بالا",
    icon: AlertCircle,
    bgClass: "bg-[var(--ds-risk-high-bg)]",
    textClass: "text-[var(--ds-risk-high-fg)]",
    borderClass: "border-[var(--ds-risk-high-border)]",
    dotClass: "bg-amber-600",
  },
  medium: {
    label: "ریسک متوسط",
    icon: AlertTriangle,
    bgClass: "bg-[var(--ds-risk-medium-bg)]",
    textClass: "text-[var(--ds-risk-medium-fg)]",
    borderClass: "border-[var(--ds-risk-medium-border)]",
    dotClass: "bg-yellow-500",
  },
  low: {
    label: "ریسک پایین",
    icon: Info,
    bgClass: "bg-[var(--ds-risk-low-bg)]",
    textClass: "text-[var(--ds-risk-low-fg)]",
    borderClass: "border-[var(--ds-risk-low-border)]",
    dotClass: "bg-slate-400",
  },
};

const sizeClasses: Record<NonNullable<RiskBadgeProps["size"]>, string> = {
  xs: "text-[10.5px] px-1.5 py-0 gap-1 font-bold rounded",
  sm: "text-xs px-2 py-0.5 gap-1.5 font-medium rounded-md",
  md: "text-xs px-2.5 py-1 gap-1.5 font-bold rounded-lg",
  lg: "text-sm px-3 py-1.5 gap-2 font-bold rounded-lg",
};

const iconSizes: Record<NonNullable<RiskBadgeProps["size"]>, string> = {
  xs: "size-2.5 shrink-0",
  sm: "size-3 shrink-0",
  md: "size-3.5 shrink-0",
  lg: "size-4 shrink-0",
};

export const RiskBadge = React.forwardRef<HTMLSpanElement, RiskBadgeProps>(
  ({ level, score, label, showIcon = true, showDot = false, pulse = false, size = "md", className, ...props }, ref) => {
    const config = riskConfig[level] ?? riskConfig.low;
    const Icon = config.icon;
    const displayLabel = label ?? config.label;

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center border select-none transition-colors",
          config.bgClass,
          config.textClass,
          config.borderClass,
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {showDot && (
          <span
            className={cn(
              "size-1.5 rounded-full shrink-0",
              config.dotClass,
              pulse && "animate-pulse"
            )}
            aria-hidden="true"
          />
        )}
        {showIcon && !showDot && <Icon className={iconSizes[size]} aria-hidden="true" />}
        <span>{displayLabel}</span>
        {score !== undefined && score !== null && (
          <span className="font-mono text-[0.88em] opacity-80 border-s border-current/20 ps-1.5 ms-0.5">
            {toPersianDigits(Math.round(score))}
          </span>
        )}
      </span>
    );
  }
);

RiskBadge.displayName = "RiskBadge";
