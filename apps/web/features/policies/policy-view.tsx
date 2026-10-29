"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Field, Input, Textarea, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
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

export type PolicyRow = {
  id: string;
  kind: string;
  version: string;
  effective: string;
  status: string;
  parameters: { label: string; value: string }[];
};
export function PolicyView({
  company,
  rows,
  canManage,
  more,
  busy,
  onMore,
  onCreate,
  onInspect,
}: {
  company: string;
  rows: PolicyRow[];
  canManage: boolean;
  more: boolean;
  busy: boolean;
  onMore: () => void;
  onCreate: () => void;
  onInspect: (row: PolicyRow) => void;
}) {
  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-[26px] font-medium">
            <AppIcon
              name="SlidersHorizontal"
              className="text-primary"
              size={24}
            />
            سیاست‌های مالی
          </h1>
          <p className="mt-2 text-sm text-muted">{company}</p>
        </div>
        {canManage ? (
          <Button onClick={onCreate}>
            <AppIcon name="Plus" />
            نسخه جدید سیاست
          </Button>
        ) : null}
      </header>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>سیاست</TableHead>
            <TableHead>نسخه</TableHead>
            <TableHead>تاریخ اثر</TableHead>
            <TableHead>اعتبارسنجی</TableHead>
            <TableHead>جزئیات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableRowHeader>{row.kind}</TableRowHeader>
                <TableCell>{row.version}</TableCell>
                <TableCell>{row.effective}</TableCell>
                <TableCell>
                  <Badge tone="neutral">{row.status}</Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" onClick={() => onInspect(row)}>
                    <AppIcon name="Eye" />
                    مشاهده
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableEmptyCell colSpan={5} title="سیاستی ثبت نشده" />
            </TableRow>
          )}
        </TableBody>
      </Table>
      {more ? (
        <Button variant="secondary" disabled={busy} onClick={onMore}>
          <AppIcon name="ChevronsDown" />
          نمایش بیشتر
        </Button>
      ) : null}
    </div>
  );
}
export function PolicyForm({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (
    e: FormEvent<HTMLFormElement>,
    kind: "upload" | "forecast",
  ) => void;
}) {
  const [kind, setKind] = useState<"upload" | "forecast">("forecast");
  return (
    <Dialog
      icon="SlidersHorizontal"
      open
      title="نسخه جدید سیاست"
      busy={busy}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Form className="space-y-5" onSubmit={(e) => onSubmit(e, kind)}>
        <Field icon="SlidersHorizontal" id="policy-kind" label="نوع سیاست">
          <Select
            id="policy-kind"
            label="نوع سیاست"
            value={kind}
            onValueChange={(v) => setKind(v as "upload" | "forecast")}
            options={[
              { value: "forecast", label: "پیش‌بینی نقدینگی" },
              { value: "upload", label: "بارگذاری فایل" },
            ]}
            disabled={busy}
          />
        </Field>
        <Field icon="CalendarRange" id="policy-effective" label="تاریخ اثر">
          <PersianDatePicker
            id="policy-effective"
            name="effective_from"
            label="تاریخ اثر"
            required
            disabled={busy}
          />
        </Field>
        {kind === "forecast" ? (
          <>
            <Field
              icon="ArrowUpRight"
              id="policy-events"
              label="حداقل سابقه پرداخت"
            >
              <Input
                id="policy-events"
                name="minimum_events"
                type="number"
                min={1}
                max={10000}
                defaultValue={3}
                required
                disabled={busy}
              />
            </Field>
            <Field
              icon="CalendarRange"
              id="policy-lookback"
              label="بازه سابقه · روز"
            >
              <Input
                id="policy-lookback"
                name="lookback_days"
                type="number"
                min={1}
                max={3650}
                defaultValue={180}
                required
                disabled={busy}
              />
            </Field>
            <p className="text-xs text-muted">
              آستانه پیشنهادی است؛ در پیش‌بینی تازه تأیید می‌شود.
            </p>
          </>
        ) : (
          <>
            <Field
              icon="FileSpreadsheet"
              id="policy-files"
              label="حداکثر تعداد فایل"
            >
              <Input
                id="policy-files"
                name="max_files"
                type="number"
                min={1}
                max={10}
                defaultValue={10}
                required
                disabled={busy}
              />
            </Field>
            <Field
              icon="SlidersHorizontal"
              id="policy-rows"
              label="حداکثر ردیف غیرخالی"
            >
              <Input
                id="policy-rows"
                name="max_data_rows"
                type="number"
                min={1}
                max={20000}
                defaultValue={20000}
                required
                disabled={busy}
              />
            </Field>
            <Field
              icon="FileSpreadsheet"
              id="policy-bytes"
              label="حداکثر حجم فایل · بایت"
            >
              <Input
                id="policy-bytes"
                name="max_file_bytes"
                type="number"
                min={1}
                defaultValue={20971520}
                required
                disabled={busy}
              />
            </Field>
            <Field
              icon="SlidersHorizontal"
              id="policy-expanded"
              label="حداکثر حجم بازشده · بایت"
            >
              <Input
                id="policy-expanded"
                name="max_expanded_bytes"
                type="number"
                min={1}
                defaultValue={67108864}
                required
                disabled={busy}
              />
            </Field>
          </>
        )}
        <Field icon="SlidersHorizontal" id="policy-reason" label="دلیل تغییر">
          <Textarea id="policy-reason" name="reason" required disabled={busy} />
        </Field>
        {error ? <FormMessage>{error}</FormMessage> : null}
        <Button type="submit" disabled={busy}>
          <AppIcon name="Save" />
          {busy ? "در حال ثبت…" : "ثبت نسخه جدید"}
        </Button>
      </Form>
    </Dialog>
  );
}
export function PolicyDetails({
  row,
  onClose,
}: {
  row: PolicyRow;
  onClose: () => void;
}) {
  return (
    <Dialog
      icon="SlidersHorizontal"
      open
      title={row.kind}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <p className="mb-5 text-sm text-muted">
        نسخه {row.version} · {row.effective} · {row.status}
      </p>
      <dl className="space-y-3">
        {row.parameters.map((p) => (
          <div
            key={p.label}
            className="flex justify-between gap-4 border-b border-border pb-3"
          >
            <dt className="text-muted">{p.label}</dt>
            <dd>
              <bdi>{p.value}</bdi>
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
