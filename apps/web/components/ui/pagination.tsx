"use client";
import { persian } from "@/lib/utils";
import { Button } from "./button";
export function Pagination({
  page,
  total,
  pageSize = 25,
  onPrevious,
  onNext,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (total <= pageSize) return null;
  return (
    <nav
      aria-label="صفحه‌بندی جدول"
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <p aria-live="polite" className="text-xs text-muted">
        {persian(page * pageSize + 1)} تا{" "}
        {persian(Math.min(total, (page + 1) * pageSize))} از {persian(total)}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page === 0} onClick={onPrevious}>
          قبلی
        </Button>
        <Button
          variant="secondary"
          disabled={(page + 1) * pageSize >= total}
          onClick={onNext}
        >
          بعدی
        </Button>
      </div>
    </nav>
  );
}
export function CursorPagination({
  page,
  hasPrevious,
  hasNext,
  previousPage,
  nextPage,
}: {
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  previousPage: () => void;
  nextPage: () => void;
}) {
  if (!hasPrevious && !hasNext) return null;
  return (
    <nav
      aria-label="صفحه‌بندی فهرست"
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-xs text-muted">صفحه {persian(page + 1)}</p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={!hasPrevious}
          onClick={previousPage}
        >
          قبلی
        </Button>
        <Button variant="secondary" disabled={!hasNext} onClick={nextPage}>
          بعدی
        </Button>
      </div>
    </nav>
  );
}
