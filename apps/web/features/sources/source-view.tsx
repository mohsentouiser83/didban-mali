"use client";
import { useRef, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Field, Input, Textarea, FormMessage } from "@/components/ui/field";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
  TableEmptyCell,
} from "@/components/ui/table";
export type SourceRow = {
  id: string;
  name: string;
  format: string;
  created: string;
  archived: boolean;
  version: number;
};
export function SourceView({
  company,
  rows,
  canManage,
  more,
  busy,
  onMore,
  onArchive,
  onImpact,
}: {
  company: string;
  rows: SourceRow[];
  canManage: boolean;
  more: boolean;
  busy: boolean;
  onMore: () => void;
  onArchive: (row: SourceRow) => void;
  onImpact: (row: SourceRow) => void;
}) {
  return (
    <div className="space-y-7">
      <header>
        <h1 className="font-heading text-[26px] font-medium">
          فایل‌ها و نگهداری
        </h1>
        <p className="mt-2 text-sm text-muted">{company}</p>
      </header>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>فایل</TableHead>
            <TableHead>نوع</TableHead>
            <TableHead>بارگذاری</TableHead>
            <TableHead>وضعیت</TableHead>
            {canManage ? <TableHead>مدیریت</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableRowHeader>
                  <bdi className="break-all">{row.name}</bdi>
                </TableRowHeader>
                <TableCell>{row.format}</TableCell>
                <TableCell>{row.created}</TableCell>
                <TableCell>
                  <Badge tone="neutral">
                    {row.archived ? "بایگانی" : "نگهداری‌شده"}
                  </Badge>
                </TableCell>
                {canManage ? (
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" onClick={() => onArchive(row)}>
                        {row.archived ? "خروج از بایگانی" : "بایگانی"}
                      </Button>
                      <Button variant="ghost" onClick={() => onImpact(row)}>
                        بررسی حذف
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableEmptyCell
                colSpan={canManage ? 5 : 4}
                title="فایلی بارگذاری نشده"
              />
            </TableRow>
          )}
        </TableBody>
      </Table>
      {more ? (
        <Button variant="secondary" disabled={busy} onClick={onMore}>
          نمایش بیشتر
        </Button>
      ) : null}
    </div>
  );
}
export function RetentionForm({
  days,
  busy,
  error,
  success,
  onSubmit,
}: {
  days: string;
  busy: boolean;
  error: string | null;
  success: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="mt-7 space-y-5 rounded-panel border border-border bg-surface p-5 sm:p-7">
      <h2 className="text-sm font-medium">مدت نگهداری</h2>
      <Form className="space-y-5" onSubmit={onSubmit}>
        <Field id="retention-days" label="مدت نگهداری · روز">
          <Input
            key={days}
            id="retention-days"
            name="retention_days"
            type="number"
            min={1}
            max={36500}
            defaultValue={days}
            placeholder="بدون محدودیت"
            disabled={busy}
          />
        </Field>
        <p className="text-xs text-muted">
          این تنظیم فایل‌ها را خودکار حذف نمی‌کند؛ وابستگی‌های تاریخی محفوظ‌اند.
        </p>
        <Field id="retention-reason" label="دلیل تغییر">
          <Textarea
            id="retention-reason"
            name="reason"
            required
            disabled={busy}
          />
        </Field>
        {error ? <FormMessage>{error}</FormMessage> : null}
        {success ? (
          <FormMessage success>مدت نگهداری ثبت شد.</FormMessage>
        ) : null}
        <Button disabled={busy} type="submit">
          {busy ? "در حال ثبت…" : "ثبت مدت نگهداری"}
        </Button>
      </Form>
    </section>
  );
}
export function ArchiveConfirmation({
  row,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  row: SourceRow;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open
      title={row.archived ? "فایل از بایگانی خارج شود؟" : "فایل بایگانی شود؟"}
      description={row.name}
      busy={busy}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      onConfirm={onConfirm}
    >
      <p className="text-sm text-muted">
        اصل فایل و اثر آن در گزارش‌های قبلی حفظ می‌شود.
      </p>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </ConfirmDialog>
  );
}
export function ImpactDialog({
  name,
  dependencies,
  loading,
  error,
  onRetry,
  onClose,
  onDelete,
  canDelete,
}: {
  name: string;
  dependencies: string[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  return (
    <Dialog
      open
      title="وابستگی‌های فایل"
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <p className="mb-5 break-all text-sm">
        <bdi>{name}</bdi>
      </p>
      {loading ? (
        <LoadingState label="در حال بررسی وابستگی‌ها" />
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">
            {canDelete
              ? "فایل سابقه وابسته ندارد."
              : "حذف قطعی مجاز نیست؛ بایگانی در دسترس است."}
          </p>
          <ul className="mb-5 space-y-2">
            {dependencies.map((text, i) => (
              <li key={i} className="rounded-control bg-background p-3 text-sm">
                {text}
              </li>
            ))}
          </ul>
          {canDelete ? (
            <Button variant="danger" onClick={onDelete}>
              حذف قطعی فایل
            </Button>
          ) : null}
        </>
      )}
    </Dialog>
  );
}
export function DeleteConfirmation({
  row,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  row: SourceRow;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <ConfirmDialog
      open
      title="فایل برای همیشه حذف شود؟"
      description={row.name}
      busy={busy}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      onConfirm={() => form.current?.requestSubmit()}
    >
      <Form ref={form} onSubmit={onSubmit} className="space-y-4">
        <Field id="source-delete-reason" label="دلیل حذف">
          <Textarea
            id="source-delete-reason"
            name="reason"
            required
            disabled={busy}
          />
        </Field>
        <p className="text-sm text-danger">
          اصل فایل پس از تکمیل عملیات قابل بازیابی نیست.
        </p>
        {error ? <FormMessage>{error}</FormMessage> : null}
      </Form>
    </ConfirmDialog>
  );
}
