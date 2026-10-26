"use client";

import { ControlLabel, fieldIcon } from "./field-layout";
import { useId } from "react";
import { Button } from "./button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "./icons";

const number = (value: number) => value.toLocaleString("fa-IR");

export interface TablePaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  loading?: boolean;
}

/** Zero-based pages; callers own fetching and reset the page when the size changes. */
export function TablePagination({ total, page, pageSize, onPageChange, onPageSizeChange, loading = false }: TablePaginationProps) {
  const sizeId = useId();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages - 1);
  const visiblePages = Array.from(new Set([0, current - 1, current, current + 1, pages - 1]))
    .filter((value) => value >= 0 && value < pages).sort((a, b) => a - b);
  return <nav dir="rtl" aria-label="صفحه‌بندی جدول" className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-border px-4 py-4 text-sm">
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <span role="status" aria-live="polite" className="tabular-nums text-muted-foreground">{total ? `${number(current * pageSize + 1)}–${number(Math.min((current + 1) * pageSize, total))} از ${number(total)} ردیف` : loading ? "در حال دریافت ردیف‌ها…" : "۰ ردیف"}</span>
      {!onPageSizeChange && <span className="text-muted-foreground">{number(pageSize)} ردیف در صفحه</span>}
      {onPageSizeChange && <div className="flex items-center gap-2"><ControlLabel htmlFor={sizeId} icon={fieldIcon("تعداد ردیف")}>ردیف در صفحه</ControlLabel><Select dir="rtl" value={String(pageSize)} disabled={loading} onValueChange={(value) => onPageSizeChange(Number(value))}><SelectTrigger id={sizeId} className="min-h-11 w-20"><SelectValue /></SelectTrigger><SelectContent>{[10, 25, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{number(size)}</SelectItem>)}</SelectContent></Select></div>}
    </div>
    <div className="flex max-w-full flex-wrap items-center gap-1">
      <span className="me-2 text-xs tabular-nums text-muted-foreground">صفحه {number(current + 1)} از {number(pages)}</span>
      <Button variant="ghost" size="icon" aria-label="صفحه اول" disabled={loading || current === 0} onClick={() => onPageChange(0)}><ChevronsRight aria-hidden="true" size={18} /></Button>
      <Button variant="outline" size="icon" aria-label="صفحه قبل" disabled={loading || current === 0} onClick={() => onPageChange(current - 1)}><ChevronRight aria-hidden="true" size={18} /></Button>
      <div className="hidden items-center gap-1 sm:flex">{visiblePages.map((value, index) => <div key={value} className="flex items-center gap-1">{index > 0 && value - visiblePages[index - 1] > 1 && <span aria-hidden="true" className="px-1 text-muted-foreground">…</span>}<Button variant={current === value ? "secondary" : "ghost"} size="icon" aria-label={`صفحه ${number(value + 1)}`} aria-current={current === value ? "page" : undefined} disabled={loading} onClick={() => onPageChange(value)}>{number(value + 1)}</Button></div>)}</div>
      <Button variant="outline" size="icon" aria-label="صفحه بعد" disabled={loading || current >= pages - 1} onClick={() => onPageChange(current + 1)}><ChevronLeft aria-hidden="true" size={18} /></Button>
      <Button variant="ghost" size="icon" aria-label="صفحه آخر" disabled={loading || current >= pages - 1} onClick={() => onPageChange(pages - 1)}><ChevronsLeft aria-hidden="true" size={18} /></Button>
    </div>
  </nav>;
}
