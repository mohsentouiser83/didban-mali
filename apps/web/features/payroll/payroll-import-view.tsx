"use client";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/field";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import type { ImportCell } from "./payroll-import-values";
export function PayrollImportView({
  rows,
  count,
  errors,
  hasErrors,
  pageLabel,
  previous,
  next,
  busy,
  error,
  onClose,
  returnFocusRef,
  onPrevious,
  onNext,
  onCommit,
}: {
  rows: ImportCell[];
  count: string;
  errors: string;
  hasErrors: boolean;
  pageLabel: string;
  previous: boolean;
  next: boolean;
  busy: boolean;
  error?: string;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  onPrevious: () => void;
  onNext: () => void;
  onCommit: () => void;
}) {
  return (
    <Dialog
      size="wide"
      returnFocusRef={returnFocusRef}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="بازبینی ورود گروهی"
      busy={busy}
    >
      <div className="space-y-4">
        <p>
          {count} ردیف · {errors} خطا
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ردیف فایل</TableHead>
              <TableHead>ستون</TableHead>
              <TableHead>مقدار فایل</TableHead>
              <TableHead>واحد فایل</TableHead>
              <TableHead>مقدار ثبت‌شدنی</TableHead>
              <TableHead>خطای ستون</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableRowHeader>{row.row}</TableRowHeader>
                <TableCell>{row.field}</TableCell>
                <TableCell>{row.original}</TableCell>
                <TableCell>{row.unit}</TableCell>
                <TableCell>{row.normalized}</TableCell>
                <TableCell>{row.error ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" disabled={!previous} onClick={onPrevious}>
            صفحه قبل
          </Button>
          <p role="status">{pageLabel}</p>
          <Button variant="secondary" disabled={!next} onClick={onNext}>
            صفحه بعد
          </Button>
        </div>
        <FormMessage>{error}</FormMessage>
        <Button onClick={onCommit} disabled={busy || hasErrors}>
          تأیید و ورود اطلاعات
        </Button>
      </div>
    </Dialog>
  );
}
