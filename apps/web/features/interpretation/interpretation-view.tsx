"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/features/companies/company-view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import { EmptyState, StatusMessage } from "@/components/ui/states";
import { Dialog } from "@/components/ui/dialog";
export type RowDisplay = {
  id: string;
  location: string;
  kind: string;
  state: string;
  tone: "success" | "warning" | "neutral";
  errors: string[];
  raw: { label: string; value: string }[];
  values: { label: string; value: string }[];
};
export type SheetDisplay = {
  name: string;
  kind: string;
  provenance: string;
  controls: { label: string; value: string }[];
};
export function InterpretationView({
  name,
  back,
  summary,
  sheets,
  rows,
  onEvidence,
  onConfigure,
  canConfigure,
  configurationLocked,
  published,
  more,
  onMore,
  busy,
  waiting,
  question,
  rowState,
}: {
  rowState?: ReactNode;
  question?: ReactNode;
  name: string;
  back: string;
  summary?: string;
  sheets: SheetDisplay[];
  rows: RowDisplay[];
  onEvidence: (row: RowDisplay) => void;
  onConfigure: () => void;
  canConfigure: boolean;
  configurationLocked: boolean;
  published: boolean;
  more: boolean;
  onMore: () => void;
  busy: boolean;
  waiting: boolean;
}) {
  return (
    <section className="space-y-5 motion-safe:animate-reveal">
      <PageHeader
        title="تفسیر و شواهد فایل"
        description={name}
        action={
          <Button asChild variant="ghost">
            <Link href={back}>بازگشت به بسته</Link>
          </Button>
        }
      />
      {question}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-summary border border-primary/10 bg-linear-to-l from-accent to-surface p-5 sm:p-7">
        <div>
          <h2 className="font-heading text-lg font-medium">داده استاندارد</h2>
          <p className="mt-2 text-muted">
            {summary ??
              (waiting
                ? "تفسیر در انتظار تکمیل است."
                : "تفسیر هنوز آماده نیست.")}
          </p>
        </div>
        {canConfigure ? (
          <Button variant="secondary" onClick={onConfigure}>
            تنظیم تشخیص
          </Button>
        ) : null}
      </div>
      {configurationLocked ? (
        <StatusMessage>
          برای تغییر تشخیص، فایل‌ها را در بسته تازه بارگذاری کنید.
        </StatusMessage>
      ) : !published ? (
        <StatusMessage>
          این داده‌ها هنوز وارد محاسبات و گزارش مالی نشده‌اند.
        </StatusMessage>
      ) : null}
      {sheets.map((sheet) => (
        <article
          key={sheet.name}
          className="rounded-panel border border-border bg-surface p-5"
        >
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-medium">{sheet.name}</h2>
            <Badge>{sheet.kind}</Badge>
            <span className="text-xs text-muted">{sheet.provenance}</span>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {sheet.controls.map((c) => (
              <div key={c.label} className="flex justify-between gap-3 text-xs">
                <dt className="text-muted">{c.label}</dt>
                <dd>{c.value}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
      {rowState ??
        (rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شیت و ردیف اصلی</TableHead>
                <TableHead>نوع داده</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>شواهد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableRowHeader>{row.location}</TableRowHeader>
                  <TableCell>{row.kind}</TableCell>
                  <TableCell>
                    <Badge tone={row.tone}>{row.state}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      onClick={() => onEvidence(row)}
                      aria-label={`مشاهده شواهد ${row.location}`}
                    >
                      مشاهده
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title={waiting ? "منتظر تکمیل تفسیر" : "رکوردی برای نمایش نیست"}
          />
        ))}
      {more ? (
        <Button variant="secondary" disabled={busy} onClick={onMore}>
          ردیف‌های بیشتر
        </Button>
      ) : null}
    </section>
  );
}
export function RowEvidence({
  row,
  onClose,
}: {
  row: RowDisplay | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!row}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="شواهد ردیف"
      description={row?.location}
    >
      <div className="space-y-5">
        {row?.errors.map((error) => (
          <StatusMessage key={error}>{error}</StatusMessage>
        ))}
        <h3 className="font-medium">مقادیر استاندارد · ریال</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>فیلد</TableHead>
              <TableHead>مقدار</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {row?.values.map((v) => (
              <TableRow key={v.label}>
                <TableRowHeader>{v.label}</TableRowHeader>
                <TableCell className="max-w-64 break-words whitespace-pre-wrap">
                  {v.value}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <h3 className="font-medium">مقادیر اصلی</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ستون</TableHead>
              <TableHead>مقدار اصلی</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {row?.raw.map((v, i) => (
              <TableRow key={i}>
                <TableRowHeader>{v.label}</TableRowHeader>
                <TableCell className="max-w-64 break-words whitespace-pre-wrap">
                  {v.value}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Dialog>
  );
}
