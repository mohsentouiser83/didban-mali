import type { ReactNode } from "react";
import type { FinancialChartData } from "./chart-data";
export function ChartGrid() {
  return (
    <g aria-hidden className="stroke-border">
      {[19, 79, 139, 199].map((y) => (
        <line key={y} x1={52} x2={736} y1={y} y2={y} strokeDasharray="4 5" />
      ))}
    </g>
  );
}
export function ChartXAxis({ first, last }: { first: string; last: string }) {
  return (
    <g aria-hidden className="fill-muted text-[11px]">
      <text x={52} y={225} textAnchor="start">
        {first}
      </text>
      <text x={736} y={225} textAnchor="end">
        {last}
      </text>
    </g>
  );
}
export function ChartYAxis() {
  return (
    <g aria-hidden className="fill-muted text-[10px]">
      <text x={10} y={27}>
        بیشینه
      </text>
      <text x={10} y={199}>
        کمینه
      </text>
    </g>
  );
}
export function FinancialChart({
  label,
  data,
  selectedIndex,
}: {
  label: string;
  data: FinancialChartData;
  selectedIndex?: number;
}) {
  const selected = data.points.find((p) => p.index === selectedIndex);
  return (
    <svg
      viewBox="0 0 780 235"
      role="img"
      aria-label={label}
      className="h-56 w-full overflow-visible [direction:ltr]"
    >
      <ChartGrid />
      <ChartYAxis />
      <ChartXAxis first={data.firstLabel} last={data.lastLabel} />
      {data.paths.map((path, index) => (
        <path
          key={index}
          d={path}
          fill="none"
          strokeWidth={2.5}
          className="stroke-primary"
        />
      ))}
      {data.points.map((p) => (
        <circle
          key={p.index}
          cx={p.x}
          cy={p.y}
          r={data.points.length === 1 ? 4 : 1.5}
          className="fill-primary"
        />
      ))}
      {selected ? (
        <g aria-hidden>
          <line
            x1={selected.x}
            x2={selected.x}
            y1={19}
            y2={199}
            className="stroke-primary/30"
          />
          <circle
            cx={selected.x}
            cy={selected.y}
            r={5}
            className="fill-surface stroke-primary"
            strokeWidth={2}
          />
        </g>
      ) : null}
    </svg>
  );
}
export function ChartTooltipSurface({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-control border border-border bg-surface p-4 shadow-panel">
      {children}
    </div>
  );
}
export function ChartTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="text-sm">
      <ChartTooltipSurface>{children}</ChartTooltipSurface>
    </section>
  );
}
