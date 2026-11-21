"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BlockResult, CustomReportBlock, ReportDataSource } from "@/lib/custom-reports";
import { VISUALIZATION_LABELS } from "@/lib/custom-reports";
import { persian } from "@/lib/utils";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartBarIcon,
  ChartLineUpIcon,
  ChartPieSliceIcon,
  CopyIcon,
  PencilSimpleIcon,
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

const CHART_COLORS = ["#5556DE", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

function formatNum(val: unknown): string {
  if (val === null || val === undefined || val === "") return "-";
  if (typeof val === "number" || typeof val === "bigint") {
    return persian(Number(val).toLocaleString());
  }
  return String(val);
}

export function BlockCard({
  block,
  preview,
  isSelected,
  dataSource,
  onSelect,
  onEdit,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onChangeWidth,
}: {
  block: CustomReportBlock;
  preview?: BlockResult;
  isSelected: boolean;
  dataSource?: ReportDataSource;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onChangeWidth?: (w: 4 | 6 | 8 | 12) => void;
}) {
  const { visualization, title, width } = block;

  const widthClass =
    width === 4
      ? "lg:col-span-4 col-span-12"
      : width === 6
      ? "lg:col-span-6 col-span-12"
      : width === 8
      ? "lg:col-span-8 col-span-12"
      : "col-span-12";

  return (
    <article
      onClick={onSelect}
      className={`group flex flex-col justify-between rounded-panel border bg-surface p-5 shadow-card transition-all duration-200 cursor-pointer ${
        isSelected
          ? "border-primary ring-2 ring-primary/20 shadow-md"
          : "border-border hover:border-primary/40"
      } ${widthClass}`}
    >
      {/* Block Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          {visualization === "data_table" && <TableIcon size={18} className="text-secondary" />}
          {visualization === "bar_chart" && <ChartBarIcon size={18} className="text-primary" />}
          {visualization === "horizontal_bar" && <ChartBarIcon size={18} className="text-primary" />}
          {visualization === "line_chart" && <ChartLineUpIcon size={18} className="text-emerald" />}
          {visualization === "area_chart" && <ChartLineUpIcon size={18} className="text-emerald" />}
          {visualization === "pie_chart" && <ChartPieSliceIcon size={18} className="text-amber" />}
          {visualization === "donut_chart" && <ChartPieSliceIcon size={18} className="text-amber" />}
          {visualization === "metric_strip" && <ChartLineUpIcon size={18} className="text-primary" />}
          <h4 className="font-heading text-sm font-medium text-foreground">{title}</h4>
          <Badge tone="neutral" className="text-xs">
            {dataSource?.label_fa || block.entity_type}
          </Badge>
          <Badge tone="primary" className="text-xs">
            {VISUALIZATION_LABELS[visualization] || visualization}
          </Badge>
        </div>

        {/* Actions toolbar */}
        <div
          className="flex items-center gap-1 opacity-80 group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {onChangeWidth && (
            <select
              aria-label="تغییر عرض کارت"
              value={width}
              onChange={(e) => onChangeWidth(Number(e.target.value) as 4 | 6 | 8 | 12)}
              className="h-8 rounded-control border border-border bg-surface px-2 text-xs text-muted"
            >
              <option value={12}>تمام عرض (۱۲)</option>
              <option value={8}>دوسوم (۸)</option>
              <option value={6}>نصف (۶)</option>
              <option value={4}>یک‌سوم (۴)</option>
            </select>
          )}

          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              title="انتقال به بالا"
              className="rounded-control p-1 text-muted hover:bg-neutral-soft hover:text-foreground"
            >
              <ArrowUpIcon size={15} />
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={onMoveDown}
              title="انتقال به پایین"
              className="rounded-control p-1 text-muted hover:bg-neutral-soft hover:text-foreground"
            >
              <ArrowDownIcon size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={onDuplicate}
            title="تکثیر بلاک"
            className="rounded-control p-1 text-muted hover:bg-neutral-soft hover:text-foreground"
          >
            <CopyIcon size={15} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            title="تنظیمات و فیلترها"
            className="rounded-control p-1 text-primary hover:bg-primary-soft hover:text-primary-strong"
          >
            <PencilSimpleIcon size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="حذف بلاک"
            className="rounded-control p-1 text-rose hover:bg-rose-soft hover:text-rose-strong"
          >
            <TrashIcon size={15} />
          </button>
        </div>
      </div>

      {/* Block Body / Content */}
      <div className="min-h-[160px] py-1">
        {preview?.error ? (
          <div className="flex h-36 items-center justify-center rounded-control bg-rose-soft/30 p-4 text-center text-xs text-rose">
            {preview.error}
          </div>
        ) : !preview ? (
          <div className="flex h-36 items-center justify-center text-xs text-muted">
            در حال بارگذاری داده‌های {dataSource?.label_fa || block.entity_type}...
          </div>
        ) : visualization === "metric_strip" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {preview.metrics.map((m, idx) => (
              <div key={idx} className="rounded-control bg-surface-muted/40 p-3">
                <span className="block text-xs text-muted">{m.label_fa}</span>
                <span className="font-numeric text-xl font-medium text-foreground">
                  {formatNum(m.value)}
                </span>
                {m.unit && <span className="mr-1 text-xs text-muted">{m.unit}</span>}
              </div>
            ))}
          </div>
        ) : visualization === "data_table" ? (
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {preview.columns.map((col) => (
                    <TableHead key={col.key}>{col.label_fa}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={preview.columns.length} className="text-center text-xs text-muted">
                      هیچ رکوردی یافت نشد.
                    </TableCell>
                  </TableRow>
                ) : (
                  preview.rows.slice(0, 8).map((row, rIdx) => (
                    <TableRow key={rIdx}>
                      {preview.columns.map((col) => (
                        <TableCell key={col.key} className="text-xs">
                          {formatNum(row[col.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {preview.total > 8 && (
              <p className="mt-2 text-left text-xs text-muted">
                نمایش ۸ ردیف از {formatNum(preview.total)} رکورد کل
              </p>
            )}
          </div>
        ) : visualization === "pie_chart" || visualization === "donut_chart" ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  formatter={(val: unknown) => [formatNum(val), ""]}
                  contentStyle={{ direction: "rtl", borderRadius: 8 }}
                />
                <Legend />
                <Pie
                  data={preview.chart_data.labels.map((lbl, idx) => ({
                    name: lbl,
                    value: preview.chart_data.datasets[0]?.data[idx] || 0,
                  }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={visualization === "donut_chart" ? 55 : 0}
                  outerRadius={85}
                >
                  {preview.chart_data.labels.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {visualization === "line_chart" || visualization === "area_chart" ? (
                <LineChart
                  data={preview.chart_data.labels.map((lbl, idx) => ({
                    label: lbl,
                    val: preview.chart_data.datasets[0]?.data[idx] || 0,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(val: unknown) => [formatNum(val), ""]}
                    contentStyle={{ direction: "rtl", borderRadius: 8 }}
                  />
                  <Line type="monotone" dataKey="val" stroke="#5556DE" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              ) : (
                <BarChart
                  data={preview.chart_data.labels.map((lbl, idx) => ({
                    label: lbl,
                    val: preview.chart_data.datasets[0]?.data[idx] || 0,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(val: unknown) => [formatNum(val), ""]}
                    contentStyle={{ direction: "rtl", borderRadius: 8 }}
                  />
                  <Bar dataKey="val" fill="#5556DE" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Block Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-xs text-muted">
        <span>تعداد رکوردهای منطبق: {formatNum(preview?.total || 0)}</span>
        <Button variant="ghost" onClick={onEdit} className="h-7 text-xs">
          ویرایش و فیلترها
        </Button>
      </div>
    </article>
  );
}
