"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { cn, amount, persian } from "@/lib/utils";

export type WaterfallStepType =
  | "initial"
  | "inflow"
  | "outflow"
  | "subtotal"
  | "final";

export interface WaterfallStep {
  id?: string;
  label: string;
  value: number;
  type?: WaterfallStepType;
  note?: string;
  color?: string;
}

export interface WaterfallChartProps {
  steps: WaterfallStep[];
  unit?: "IRR" | "TOMAN";
  formatValue?: (val: number) => string;
  label?: string;
  className?: string;
  height?: number;
  rtl?: boolean;
  showBridgeLines?: boolean;
  showValues?: boolean;
}

interface ComputedWaterfallStep {
  id: string;
  step: WaterfallStep;
  type: WaterfallStepType;
  startVal: number;
  endVal: number;
  delta: number;
  displayVal: number;
  runningBalance: number;
  fillColor: string;
  strokeColor: string;
  typeLabel: string;
}

const TYPE_CONFIG: Record<
  WaterfallStepType,
  { fill: string; stroke: string; labelFa: string }
> = {
  initial: {
    fill: "#5556DE",
    stroke: "#4345BF",
    labelFa: "موجودی اولیه",
  },
  inflow: {
    fill: "#10B981",
    stroke: "#059669",
    labelFa: "ورودی / درآمد",
  },
  outflow: {
    fill: "#EF4444",
    stroke: "#DC2626",
    labelFa: "خروجی / هزینه",
  },
  subtotal: {
    fill: "#368C98",
    stroke: "#2B707A",
    labelFa: "جمع میانی",
  },
  final: {
    fill: "#5556DE",
    stroke: "#4345BF",
    labelFa: "موجودی نهایی",
  },
};

export function WaterfallChart({
  steps = [],
  unit = "IRR",
  formatValue,
  label = "نمودار آبشاری نقدینگی و سود",
  className,
  height = 360,
  rtl = true,
  showBridgeLines = true,
  showValues = true,
}: WaterfallChartProps) {
  const chartId = useId();
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);

  const formatMoney = (val: number, showSign = false) => {
    if (formatValue) return formatValue(val);
    const signPrefix = showSign && val > 0 ? "+" : "";
    const formatted = amount(String(Math.round(val)), unit);
    const unitSuffix = unit === "IRR" ? "ریال" : "تومان";
    return `${signPrefix}${formatted} ${unitSuffix}`;
  };

  // Compute waterfall steps values and running balances
  const computedSteps: ComputedWaterfallStep[] = [];
  let running = 0;

  for (let i = 0; i < steps.length; i++) {
    const raw = steps[i];
    let inferredType: WaterfallStepType = raw.type ?? "inflow";

    if (!raw.type) {
      if (i === 0) {
        inferredType = "initial";
      } else if (i === steps.length - 1) {
        inferredType = "final";
      } else if (raw.value < 0) {
        inferredType = "outflow";
      } else {
        inferredType = "inflow";
      }
    }

    let startVal = 0;
    let endVal = 0;
    let delta = 0;
    let displayVal = raw.value;

    if (inferredType === "initial") {
      startVal = 0;
      endVal = raw.value;
      delta = raw.value;
      running = endVal;
      displayVal = raw.value;
    } else if (inferredType === "inflow") {
      delta = Math.abs(raw.value);
      startVal = running;
      endVal = running + delta;
      running = endVal;
      displayVal = delta;
    } else if (inferredType === "outflow") {
      delta = -Math.abs(raw.value);
      startVal = running;
      endVal = running + delta;
      running = endVal;
      displayVal = delta;
    } else if (inferredType === "subtotal") {
      startVal = 0;
      endVal = raw.value !== undefined ? raw.value : running;
      delta = endVal - running;
      running = endVal;
      displayVal = endVal;
    } else if (inferredType === "final") {
      startVal = 0;
      endVal = raw.value !== undefined ? raw.value : running;
      delta = endVal - running;
      running = endVal;
      displayVal = endVal;
    }

    const cfg = TYPE_CONFIG[inferredType];

    computedSteps.push({
      id: raw.id || `step-${i}`,
      step: raw,
      type: inferredType,
      startVal,
      endVal,
      delta,
      displayVal,
      runningBalance: running,
      fillColor: raw.color || cfg.fill,
      strokeColor: cfg.stroke,
      typeLabel: cfg.labelFa,
    });
  }

  if (!computedSteps.length) {
    return (
      <div
        role="region"
        aria-label={label}
        className={cn(
          "flex h-64 w-full items-center justify-center rounded-panel border border-border bg-surface text-sm text-muted",
          className,
        )}
      >
        داده‌ای برای نمایش در نمودار آبشاری وجود ندارد.
      </div>
    );
  }

  // Calculate scales and coordinate geometry
  const allValues = [
    0,
    ...computedSteps.map((s) => s.startVal),
    ...computedSteps.map((s) => s.endVal),
  ];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const valRange = maxVal - minVal || 1;

  // Add 12% padding above and below
  const yMin = minVal < 0 ? minVal - valRange * 0.12 : 0;
  const yMax = maxVal + valRange * 0.15;
  const ySpan = yMax - yMin || 1;

  const viewBoxWidth = Math.max(680, computedSteps.length * 100);
  const viewBoxHeight = height;

  const paddingTop = 45;
  const paddingBottom = 75;
  const paddingStart = rtl ? 75 : 30;
  const paddingEnd = rtl ? 30 : 75;

  const plotWidth = viewBoxWidth - paddingStart - paddingEnd;
  const plotHeight = viewBoxHeight - paddingTop - paddingBottom;

  const yScale = (val: number) => {
    return paddingTop + ((yMax - val) / ySpan) * plotHeight;
  };

  const slotWidth = plotWidth / computedSteps.length;
  const barWidth = Math.min(52, Math.max(28, slotWidth * 0.65));

  const getBarX = (index: number) => {
    if (rtl) {
      const slotCenter =
        viewBoxWidth - paddingStart - (index + 0.5) * slotWidth;
      return slotCenter - barWidth / 2;
    } else {
      const slotCenter = paddingStart + (index + 0.5) * slotWidth;
      return slotCenter - barWidth / 2;
    }
  };

  // Generate 4-5 horizontal tick lines
  const tickCount = 4;
  const tickValues = Array.from({ length: tickCount + 1 }, (_, i) => {
    return yMin + (i * (yMax - yMin)) / tickCount;
  });

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = rtl ? Math.max(0, index - 1) : Math.min(computedSteps.length - 1, index + 1);
      setActiveStepIndex(next);
      const el = document.getElementById(`${chartId}-bar-${next}`);
      el?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const next = rtl ? Math.min(computedSteps.length - 1, index + 1) : Math.max(0, index - 1);
      setActiveStepIndex(next);
      const el = document.getElementById(`${chartId}-bar-${next}`);
      el?.focus();
    } else if (e.key === "Escape") {
      setActiveStepIndex(null);
    }
  };

  const activeStep = activeStepIndex !== null ? computedSteps[activeStepIndex] : null;

  return (
    <div
      role="region"
      aria-label={label}
      dir={rtl ? "rtl" : "ltr"}
      className={cn(
        "relative w-full overflow-hidden rounded-panel border border-border bg-surface p-4 sm:p-6 shadow-sm motion-safe:animate-fade-in",
        className,
      )}
    >
      {/* Chart Title and Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-base font-medium text-foreground">
          {label}
        </h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: TYPE_CONFIG.inflow.fill }}
              aria-hidden
            />
            ورودی / درآمد
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: TYPE_CONFIG.outflow.fill }}
              aria-hidden
            />
            خروجی / هزینه
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: TYPE_CONFIG.final.fill }}
              aria-hidden
            />
            تراز و مانده
          </span>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative w-full overflow-x-auto overscroll-x-contain">
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          className="h-auto w-full min-w-[640px] select-none"
        >
          {/* Subtle horizontal grid lines */}
          <g aria-hidden="true" className="opacity-40">
            {tickValues.map((tickVal, i) => {
              const y = yScale(tickVal);
              return (
                <g key={i}>
                  <line
                    x1={rtl ? paddingEnd : paddingStart}
                    y1={y}
                    x2={viewBoxWidth - (rtl ? paddingStart : paddingEnd)}
                    y2={y}
                    stroke="var(--color-border, #E9ECF5)"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text
                    x={rtl ? viewBoxWidth - paddingStart + 10 : paddingStart - 10}
                    y={y + 4}
                    textAnchor={rtl ? "start" : "end"}
                    fontSize="10"
                    fill="var(--color-muted, #68718A)"
                    className="font-medium tabular-nums"
                  >
                    {persian(
                      new Intl.NumberFormat("fa-IR", {
                        notation: "compact",
                      }).format(Math.round(tickVal)),
                    )}
                  </text>
                </g>
              );
            })}

            {/* Zero baseline if in range */}
            {yMin <= 0 && yMax >= 0 && (
              <line
                x1={rtl ? paddingEnd : paddingStart}
                y1={yScale(0)}
                x2={viewBoxWidth - (rtl ? paddingStart : paddingEnd)}
                y2={yScale(0)}
                stroke="var(--color-border, #E9ECF5)"
                strokeWidth="1.5"
              />
            )}
          </g>

          {/* Connecting dashed bridge lines between steps */}
          {showBridgeLines && (
            <g aria-hidden="true" className="opacity-80">
              {computedSteps.map((step, i) => {
                if (i >= computedSteps.length - 1) return null;

                const barX = getBarX(i);
                const nextBarX = getBarX(i + 1);

                // Bridge line is at the end level of step i
                const yBridge = yScale(step.endVal);

                let x1: number;
                let x2: number;

                if (rtl) {
                  // In RTL: step i is to the right of step i+1
                  x1 = barX; // Left edge of bar i
                  x2 = nextBarX + barWidth; // Right edge of bar i+1
                } else {
                  // In LTR: step i is to the left of step i+1
                  x1 = barX + barWidth; // Right edge of bar i
                  x2 = nextBarX; // Left edge of bar i+1
                }

                return (
                  <line
                    key={`bridge-${i}`}
                    x1={x1}
                    y1={yBridge}
                    x2={x2}
                    y2={yBridge}
                    stroke="var(--color-muted, #68718A)"
                    strokeDasharray="4 3"
                    strokeWidth="1.5"
                    className="transition-all duration-200"
                  />
                );
              })}
            </g>
          )}

          {/* Bars and Values */}
          {computedSteps.map((step, i) => {
            const barX = getBarX(i);
            const yStart = yScale(step.startVal);
            const yEnd = yScale(step.endVal);

            const barTop = Math.min(yStart, yEnd);
            const barBottom = Math.max(yStart, yEnd);
            const barHeight = Math.max(3, barBottom - barTop);

            const isPositiveChange = step.delta >= 0;
            const isHovered = activeStepIndex === i;

            return (
              <g
                key={step.id}
                id={`${chartId}-bar-${i}`}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${step.step.label}: ${step.typeLabel}، ${formatMoney(step.displayVal, step.type === "inflow" || step.type === "outflow")}`}
                className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onMouseEnter={() => setActiveStepIndex(i)}
                onMouseLeave={() => setActiveStepIndex((prev) => (prev === i ? null : prev))}
                onFocus={() => setActiveStepIndex(i)}
                onBlur={() => setActiveStepIndex((prev) => (prev === i ? null : prev))}
                onKeyDown={(e) => handleKeyDown(e, i)}
              >
                {/* Bar Rectangle */}
                <rect
                  x={barX}
                  y={barTop}
                  width={barWidth}
                  height={barHeight}
                  rx={6}
                  ry={6}
                  fill={step.fillColor}
                  stroke={step.strokeColor}
                  strokeWidth={isHovered ? 2.5 : 1.2}
                  className={cn(
                    "transition-all duration-200 ease-out",
                    isHovered
                      ? "filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.15)] opacity-100"
                      : "opacity-90 hover:opacity-100",
                  )}
                />

                {/* Display Value Label above/below bar */}
                {showValues && (
                  <text
                    x={barX + barWidth / 2}
                    y={isPositiveChange ? barTop - 8 : barBottom + 16}
                    textAnchor="middle"
                    fontSize="11"
                    fill="var(--color-foreground, #20243F)"
                    className={cn(
                      "font-medium tabular-nums select-none transition-transform duration-200",
                      isHovered ? "font-bold scale-105" : "",
                    )}
                  >
                    {step.type === "inflow" || step.type === "outflow"
                      ? formatMoney(step.delta, true)
                      : formatMoney(step.displayVal)}
                  </text>
                )}

                {/* X-Axis Step Label */}
                <text
                  x={barX + barWidth / 2}
                  y={viewBoxHeight - paddingBottom + 20}
                  textAnchor="middle"
                  fontSize="12"
                  fill={isHovered ? "var(--color-primary, #5556DE)" : "var(--color-foreground, #20243F)"}
                  className="font-medium select-none"
                >
                  {step.step.label}
                </text>

                {/* Secondary Note if present */}
                {step.step.note && (
                  <text
                    x={barX + barWidth / 2}
                    y={viewBoxHeight - paddingBottom + 36}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--color-muted, #68718A)"
                    className="select-none"
                  >
                    {step.step.note}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip Card */}
        {activeStep && (
          <div
            role="tooltip"
            aria-live="polite"
            className="pointer-events-none absolute top-2 start-4 z-20 flex flex-col gap-1 rounded-xl border border-border/80 bg-surface/95 p-3 text-xs shadow-overlay backdrop-blur-md motion-safe:animate-fade-in"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-foreground">
                {activeStep.step.label}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: `${activeStep.fillColor}20`,
                  color: activeStep.fillColor,
                }}
              >
                {activeStep.typeLabel}
              </span>
            </div>

            <div className="mt-1 flex items-center justify-between gap-4 text-muted">
              <span>میزان تغییر:</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatMoney(
                  activeStep.delta,
                  activeStep.type === "inflow" || activeStep.type === "outflow",
                )}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4 text-muted">
              <span>مانده جاری:</span>
              <span className="font-semibold tabular-nums text-primary">
                {formatMoney(activeStep.runningBalance)}
              </span>
            </div>

            {activeStep.step.note && (
              <p className="mt-1 border-t border-border/60 pt-1 text-[11px] text-muted">
                {activeStep.step.note}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Screen Reader Tabular Access */}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">مرحله</th>
            <th scope="col">نوع</th>
            <th scope="col">تغییر</th>
            <th scope="col">مانده نهایی این مرحله</th>
          </tr>
        </thead>
        <tbody>
          {computedSteps.map((step) => (
            <tr key={step.id}>
              <td>{step.step.label}</td>
              <td>{step.typeLabel}</td>
              <td>{formatMoney(step.delta)}</td>
              <td>{formatMoney(step.runningBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
