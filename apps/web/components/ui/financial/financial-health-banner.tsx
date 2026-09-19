import React from "react";
import { ShieldAlert, ShieldCheck, AlertTriangle, Database, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "./money-display";

export type FinancialHealthStatus = "healthy" | "attention" | "critical";
export type DataQualityStatus = "full" | "limited";

export interface FinancialHealthBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  financialHealth: FinancialHealthStatus;
  dataQuality: DataQualityStatus;
  reliabilityScore?: number; // e.g. 92%
  actionableFindingsCount?: number;
  periodLabel?: string;
  className?: string;
}

const healthConfig: Record<
  FinancialHealthStatus,
  {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  healthy: {
    title: "وضعیت مالی پایدار و بدون ریسک بحرانی",
    description: "هیچ یافتهٔ مغایرت با اولویت بالا یا بحرانی نیازمند اقدام در این دوره مشاهده نشد.",
    icon: ShieldCheck,
    className: "border-emerald-500/30 bg-emerald-500/[0.04] text-emerald-900 dark:text-emerald-300",
  },
  attention: {
    title: "وضعیت مالی نیازمند توجه و پیگیری",
    description: "موارد مغایرت یا روند افزایشی هزینه/افت نقدینگی با اولویت متوسط یا بالا شناسایی شده است.",
    icon: AlertTriangle,
    className: "border-amber-500/30 bg-amber-500/[0.04] text-amber-900 dark:text-amber-300",
  },
  critical: {
    title: "وضعیت مالی دارای ریسک‌های بحرانی باز",
    description: "یافته‌های دارای اثر مالی سنگین یا مغایرت‌های حل‌نشده نیازمند تصمیم فوری مدیریت هستند.",
    icon: ShieldAlert,
    className: "border-red-500/30 bg-red-500/[0.04] text-red-900 dark:text-red-300",
  },
};

export const FinancialHealthBanner = React.forwardRef<HTMLDivElement, FinancialHealthBannerProps>(
  (
    {
      financialHealth,
      dataQuality,
      reliabilityScore = 100,
      actionableFindingsCount = 0,
      periodLabel,
      className,
      ...props
    },
    ref
  ) => {
    const config = healthConfig[financialHealth] ?? healthConfig.attention;
    const HealthIcon = config.icon;

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex flex-col gap-4 rounded-xl border p-5 shadow-sm transition-all md:flex-row md:items-center md:justify-between",
          config.className,
          className
        )}
        {...props}
      >
        {/* Left / Main Section: Financial Health */}
        <div className="flex items-start gap-3.5">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-background/80 shadow-sm border border-current/10">
            <HealthIcon className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-base font-extrabold text-foreground">{config.title}</strong>
              {periodLabel && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  دوره: {periodLabel}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{config.description}</p>
          </div>
        </div>

        {/* Right Section: Two-dimensional Metrics (Findings + Data Quality) */}
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-current/10 pt-3 md:border-s md:border-t-0 md:ps-5 md:pt-0">
          {/* Actionable Findings */}
          <div className="flex items-center gap-2 rounded-lg bg-background/70 px-3 py-1.5 border border-border/60">
            <Activity className="size-4 text-muted-foreground" />
            <div className="text-start">
              <span className="block text-[11px] text-muted-foreground">اقدامات باز:</span>
              <span className="font-mono text-sm font-extrabold text-foreground">
                {toPersianDigits(actionableFindingsCount)} مورد
              </span>
            </div>
          </div>

          {/* Data Quality & Reliability */}
          <div className="flex items-center gap-2 rounded-lg bg-background/70 px-3 py-1.5 border border-border/60">
            <Database className="size-4 text-muted-foreground" />
            <div className="text-start">
              <span className="block text-[11px] text-muted-foreground">اتکاپذیری داده:</span>
              <span className="font-mono text-sm font-extrabold text-foreground">
                {toPersianDigits(Math.round(reliabilityScore))}٪{" "}
                <span className="text-[10px] font-sans font-normal text-muted-foreground">
                  ({dataQuality === "full" ? "کامل" : "پوشش محدود"})
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

FinancialHealthBanner.displayName = "FinancialHealthBanner";
