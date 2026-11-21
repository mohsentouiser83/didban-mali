"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RenderedWidget } from "@/lib/report-studio";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartBarIcon,
  ChartLineUpIcon,
  ChartPieSliceIcon,
  CheckCircleIcon,
  PencilSimpleIcon,
  SparkleIcon,
  TableIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface KpiData {
  value?: number;
  formatted_value?: string;
  unit?: string;
  status?: string;
  subtitle?: string;
  trend_percent?: number | null;
}

interface DonutPoint {
  name: string;
  value: number;
  color?: string;
  percentage?: number;
}

interface TableData {
  columns?: { key: string; label: string }[];
  rows?: Record<string, unknown>[];
  total_count?: number;
}

interface AiData {
  insight?: string;
  highlights?: string[];
  sentiment?: string;
}

export function WidgetRenderer({
  widget,
  onEdit,
  onDelete,
  readOnly = false,
}: {
  widget: RenderedWidget;
  onEdit?: () => void;
  onDelete?: () => void;
  readOnly?: boolean;
}) {
  const { type, title, data } = widget;

  return (
    <div className="flex h-full flex-col justify-between rounded-panel border border-border bg-surface p-5 shadow-card transition-all duration-200 hover:border-primary/30">
      {/* Widget Header */}
      <div className="mb-4 flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          {type === "kpi_card" && <ChartLineUpIcon size={18} className="text-primary" />}
          {type === "line_chart" && <ChartLineUpIcon size={18} className="text-primary" />}
          {type === "bar_chart" && <ChartBarIcon size={18} className="text-emerald" />}
          {type === "donut_chart" && <ChartPieSliceIcon size={18} className="text-amber" />}
          {type === "data_table" && <TableIcon size={18} className="text-secondary" />}
          {type === "ai_summary" && <SparkleIcon size={18} className="text-primary" />}
          <h4 className="font-heading text-sm font-medium text-foreground">{title}</h4>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-control p-1 text-muted transition-all active:scale-90 hover:bg-neutral-soft hover:text-foreground"
                title="ویرایش ویجت"
              >
                <PencilSimpleIcon size={16} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-control p-1 text-muted transition-all active:scale-90 hover:bg-rose-soft hover:text-rose"
                title="حذف ویجت"
              >
                <TrashIcon size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Widget Content */}
      <div className="flex-1">
        {type === "kpi_card" && <KpiCardContent data={data as KpiData | null} />}
        {type === "line_chart" && <LineChartContent data={data as Record<string, unknown>[] | null} />}
        {type === "bar_chart" && <BarChartContent data={data as Record<string, unknown>[] | null} />}
        {type === "donut_chart" && <DonutChartContent data={data as DonutPoint[] | null} />}
        {type === "data_table" && <DataTableContent data={data as TableData | null} />}
        {type === "ai_summary" && <AiSummaryContent data={data as AiData | null} />}
      </div>
    </div>
  );
}

function KpiCardContent({ data }: { data: KpiData | null }) {
  if (!data) return <div className="text-sm text-muted">داده‌ای موجود نیست</div>;

  const tone =
    data.status === "positive"
      ? "success"
      : data.status === "danger"
        ? "danger"
        : data.status === "warning"
          ? "warning"
          : "neutral";

  return (
    <div className="flex h-full flex-col justify-between py-2">
      <div className="flex items-baseline gap-2">
        <span className="font-heading text-3xl font-medium tracking-tight text-foreground animate-[value-change_280ms_cubic-bezier(0.2,0.7,0.2,1)]">
          {data.formatted_value || "۰"}
        </span>
        <span className="text-xs font-medium text-muted">{data.unit || "ریال"}</span>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-muted">{data.subtitle || ""}</span>
        {data.trend_percent !== null && data.trend_percent !== undefined && (
          <Badge tone={tone} className="gap-1">
            {data.trend_percent > 0 ? (
              <ArrowUpIcon size={12} />
            ) : (
              <ArrowDownIcon size={12} />
            )}
            {Math.abs(data.trend_percent)}٪
          </Badge>
        )}
      </div>
    </div>
  );
}

function LineChartContent({ data }: { data: Record<string, unknown>[] | null }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-muted">
        داده‌ای برای ترسیم نمودار یافت نشد
      </div>
    );
  }

  const keys = Object.keys(data[0] || {}).filter((k) => k !== "name");
  const colors = ["#5556DE", "#10B981", "#F59E0B", "#EF4444"];

  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E9ECF5" vertical={false} />
          <XAxis dataKey="name" stroke="#68718A" fontSize={11} tickLine={false} />
          <YAxis
            stroke="#68718A"
            fontSize={11}
            tickLine={false}
            tickFormatter={(v: number) =>
              new Intl.NumberFormat("fa-IR", { notation: "compact" }).format(v)
            }
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#FFFFFF",
              borderColor: "#E9ECF5",
              borderRadius: "12px",
              direction: "rtl",
            }}
          />
          {keys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={colors[i % colors.length]}
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarChartContent({ data }: { data: Record<string, unknown>[] | null }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-muted">
        داده‌ای برای ترسیم نمودار یافت نشد
      </div>
    );
  }

  const keys = Object.keys(data[0] || {}).filter((k) => k !== "name");
  const colors = ["#5556DE", "#EF4444", "#10B981", "#F59E0B"];

  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E9ECF5" vertical={false} />
          <XAxis dataKey="name" stroke="#68718A" fontSize={11} tickLine={false} />
          <YAxis
            stroke="#68718A"
            fontSize={11}
            tickLine={false}
            tickFormatter={(v: number) =>
              new Intl.NumberFormat("fa-IR", { notation: "compact" }).format(v)
            }
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#FFFFFF",
              borderColor: "#E9ECF5",
              borderRadius: "12px",
              direction: "rtl",
            }}
          />
          {keys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              fill={colors[i % colors.length]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutChartContent({ data }: { data: DonutPoint[] | null }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-muted">
        داده‌ای برای ترسیم نمودار یافت نشد
      </div>
    );
  }

  return (
    <div className="flex h-64 w-full items-center justify-center" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={3}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color || "#5556DE"} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#FFFFFF",
              borderColor: "#E9ECF5",
              borderRadius: "12px",
              direction: "rtl",
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function DataTableContent({ data }: { data: TableData | null }) {
  const columns = data?.columns || [];
  const rows = data?.rows || [];

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted">
        ردیفی برای نمایش وجود ندارد
      </div>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className="text-xs">
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={String(row.id || idx)}>
              {columns.map((col) => (
                <TableCell key={col.key} className="text-xs">
                  {String(row[col.key] ?? "—")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AiSummaryContent({ data }: { data: AiData | null }) {
  if (!data) return null;

  return (
    <div className="flex flex-col justify-between space-y-4 rounded-control bg-soft-accent/40 p-4 border border-primary/20 animate-[fade-in_200ms_ease-out]">
      <p className="text-sm leading-relaxed text-foreground">{data.insight}</p>
      {Array.isArray(data.highlights) && data.highlights.length > 0 && (
        <ul className="space-y-2 border-t border-primary/10 pt-3">
          {data.highlights.map((h: string, idx: number) => (
            <li key={idx} className="flex items-start gap-2 text-xs text-secondary">
              <CheckCircleIcon size={16} className="mt-0.5 shrink-0 text-primary" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
