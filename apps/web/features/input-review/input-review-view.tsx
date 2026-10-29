"use client";
import Link from "next/link";
import type { FormEvent } from "react";
import type { Schema } from "@didban/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Form } from "@/components/ui/form";
import { Field, Textarea, FormMessage } from "@/components/ui/field";
import { Select, type Option } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import { StatusMessage } from "@/components/ui/states";
import { formatCanonical } from "@/features/interpretation/format-values";
import { choiceLabels } from "@/features/interpretation/labels";
import { persianDigits } from "@/lib/dates";

type Proposal = Schema<"InputReviewCorrection"> & {
  label: string;
  reason: string;
  change?: string;
};
export function InputReviewView({
  companyId,
  data,
  samples,
  reportChecks,
  files,
  proposals,
  options,
  target,
  onTarget,
  body,
  onBody,
  onSubmit,
  busy,
  error,
  onRefresh,
  onConfirm,
  onPropose,
  onResolve,
  onDecision,
}: {
  companyId: string;
  data: Schema<"InputReview">;
  reportChecks: { label: string; detail: string }[];
  samples: (Omit<Schema<"InputReviewSample">, "values"> & {
    values: { field: string; label: string; value: string }[];
  })[];
  files: (Schema<"InputReviewFile"> & { kinds: string })[];
  proposals: Proposal[];
  options: Option[];
  target: string;
  onTarget: (value: string) => void;
  body: string;
  onBody: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error?: string;
  onRefresh: () => void;
  onConfirm: () => void;
  onPropose: (id: string) => void;
  onResolve: (id: string) => void;
  onDecision: (id: string, accept: boolean) => void;
}) {
  return (
    <section
      className="space-y-5 rounded-summary border border-primary/20 bg-surface p-5 shadow-panel sm:p-7"
      aria-labelledby="input-review-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="input-review-title"
          className="font-heading text-lg font-medium"
        >
          بازبینی اطلاعات استخراج‌شده
        </h2>
        <Badge tone={data.confirmed ? "success" : "warning"}>
          {data.confirmed ? "تأییدشده" : "در انتظار تأیید شما"}
        </Badge>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">دوره مالی</dt>
          <dd className="mt-1">{data.overview.period_name ?? "مشخص نشده"}</dd>
        </div>
        <div>
          <dt className="text-muted">واحدهای ورودی</dt>
          <dd className="mt-1">
            {data.overview.units.map((u) => choiceLabels[u] ?? u).join("، ") ||
              "مشخص نشده"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">پوشش اعلام‌شده دوره</dt>
          <dd className="mt-1">
            {data.overview.coverage
              ? (choiceLabels[data.overview.coverage] ?? "نامشخص")
              : "نامشخص"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">
            اشخاص / فاکتورها / حساب‌های بانکی استخراج‌شده
          </dt>
          <dd className="mt-1">
            {persianDigits(String(data.overview.entities.parties_count))} /{" "}
            {persianDigits(String(data.overview.entities.invoices_count))} /{" "}
            {persianDigits(String(data.overview.entities.bank_accounts_count))}
          </dd>
        </div>
      </dl>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>فایل</TableHead>
            <TableHead>اطلاعات تشخیص‌داده‌شده</TableHead>
            <TableHead>معتبر</TableHead>
            <TableHead>ردشده / کنارگذاشته</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((f) => (
            <TableRow key={f.file_id}>
              <TableRowHeader>
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  href={`/companies/${companyId}/uploads/${data.session_id}/files/${f.file_id}`}
                >
                  {f.name}
                </Link>
              </TableRowHeader>
              <TableCell>{f.kinds || "نامشخص"}</TableCell>
              <TableCell>{persianDigits(String(f.valid_rows))}</TableCell>
              <TableCell>
                {persianDigits(String(f.rejected_rows))} /{" "}
                {persianDigits(String(f.excluded_rows))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {files.map((file) =>
        file.controls.length || file.ledger_totals ? (
          <details
            key={`controls:${file.file_id}`}
            className="rounded-panel border border-border p-4"
          >
            <summary className="cursor-pointer text-sm font-medium focus-visible:outline-primary">
              کنترل‌های {file.name}{" "}
              {file.controls.some((c) => c.outcome === "failed") ? (
                <Badge tone="warning">دارای کنترل ناموفق</Badge>
              ) : null}
            </summary>
            <div className="mt-4 space-y-3">
              {file.ledger_totals ? (
                <>
                  <h3 className="text-sm font-medium">
                    جمع ردیف‌های منبع — ریال
                  </h3>
                  <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    {(["debit", "credit", "difference"] as const).map((key) => (
                      <div key={key}>
                        <dt className="text-muted">
                          {
                            {
                              debit: "بدهکار",
                              credit: "بستانکار",
                              difference: "اختلاف جمع",
                            }[key]
                          }
                        </dt>
                        <dd>
                          {formatCanonical(
                            "amount",
                            file.ledger_totals?.[key] ?? null,
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : null}
              {file.controls.map((control, i) => (
                <div
                  key={i}
                  className="flex flex-wrap justify-between gap-2 text-sm"
                >
                  <span>
                    {control.sheet_name} ·{" "}
                    {(
                      {
                        required_columns: "ستون‌های ضروری",
                        coverage: "پوشش مستقل دوره",
                        account_role_consistency: "سازگاری حساب‌ها",
                        journal_balance: "توازن و کامل‌بودن سندها",
                        bank_balance_sequence: "توالی مانده بانک",
                        trial_balance_equation: "کنترل تراز",
                      } as Record<string, string>
                    )[control.key] ?? "کنترل منبع"}
                  </span>
                  <Badge
                    tone={
                      control.outcome === "passed"
                        ? "success"
                        : control.outcome === "failed"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {
                      { passed: "معتبر", failed: "نامعتبر", unknown: "نامشخص" }[
                        control.outcome
                      ]
                    }
                  </Badge>
                </div>
              ))}
              {file.rejected_rows ? (
                <StatusMessage>
                  ردیف‌های ردشده این فایل وارد محاسبات معتبر نمی‌شوند.
                </StatusMessage>
              ) : null}
            </div>
          </details>
        ) : null,
      )}
      <details className="rounded-panel border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium focus-visible:outline-primary">
          حساب‌ها و برداشت سامانه
        </summary>
        <div className="mt-4 space-y-2">
          {data.overview.accounts.length ? (
            data.overview.accounts.map((a) => (
              <div
                key={`${a.file_id}:${a.sheet_name}:${a.account_code}`}
                className="flex flex-wrap justify-between gap-2 border-b border-border py-2 text-sm"
              >
                <span>
                  {a.account_code} · {a.account_name}
                </span>
                <span className="text-muted">
                  {a.role ? (choiceLabels[a.role] ?? "نامشخص") : "نامشخص"}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">
              حساب دفتری در این فایل‌ها موجود نیست.
            </p>
          )}
        </div>
      </details>
      <details className="rounded-panel border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium focus-visible:outline-primary">
          نمونه ردیف‌ها و شواهد استخراج
        </summary>
        <div className="mt-4 max-h-96 space-y-4 overflow-y-auto">
          {samples.map((row) => (
            <article
              key={`${row.file_id}:${row.sheet_name}:${row.row_number}`}
              className="space-y-2 border-b border-border pb-3"
            >
              <h3 className="text-sm font-medium">
                {row.sheet_name} · ردیف {persianDigits(String(row.row_number))}
              </h3>
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                {row.values.map((v) => (
                  <div key={v.field} className="min-w-0">
                    <dt className="text-muted">{v.label}</dt>
                    <dd className="break-words">{v.value}</dd>
                  </div>
                ))}
              </dl>
              {row.error_codes.length ? (
                <Badge tone="warning">نیازمند بررسی</Badge>
              ) : null}
            </article>
          ))}
        </div>
      </details>
      <details className="rounded-panel border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium focus-visible:outline-primary">
          پیش‌نیاز گزارش‌ها
        </summary>
        <dl className="mt-4 space-y-3 text-sm">
          {reportChecks.map((r) => (
            <div key={r.label} className="flex flex-wrap justify-between gap-2">
              <dt>{r.label}</dt>
              <dd className="text-muted">{r.detail}</dd>
            </div>
          ))}
        </dl>
      </details>
      {!data.confirmed ? (
        <Form onSubmit={onSubmit} className="space-y-4">
          <Field id="review-target" label="موضوع نظر">
            <Select
              id="review-target"
              value={target}
              onValueChange={onTarget}
              options={options}
              disabled={busy}
            />
          </Field>
          <Field id="review-body" label="نظر یا اصلاح موردنیاز">
            <Textarea
              id="review-body"
              value={body}
              onChange={(e) => onBody(e.target.value)}
              maxLength={4000}
              required
              disabled={busy}
            />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            disabled={busy || !body.trim()}
          >
            ثبت نظر و بازبینی
          </Button>
        </Form>
      ) : null}
      {data.comments.map((c) => (
        <article
          key={c.id}
          className="space-y-3 rounded-panel border border-border bg-background/50 p-4"
        >
          <div className="flex flex-wrap justify-between gap-2">
            <p className="whitespace-pre-wrap text-sm">{c.body}</p>
            <Badge tone={c.status === "resolved" ? "success" : "neutral"}>
              {c.status === "resolved" ? "بررسی‌شده" : "نظر باز"}
            </Badge>
          </div>
          {c.status === "open" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => onPropose(c.id)}
              >
                دریافت پیشنهاد اصلاح
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => onResolve(c.id)}
              >
                اصلاح لازم نیست
              </Button>
            </div>
          ) : null}
        </article>
      ))}
      {proposals.map((p) => (
        <article
          key={p.id}
          className="space-y-3 rounded-panel border border-border p-4"
        >
          <Badge tone={p.status === "proposed" ? "warning" : "neutral"}>
            {p.label}
          </Badge>
          {p.reason ? <p className="text-sm">{p.reason}</p> : null}
          {p.change ? <p className="break-words text-sm">{p.change}</p> : null}
          {["proposed", "ambiguous", "unavailable", "usage_unknown"].includes(
            p.status,
          ) ? (
            <div className="flex flex-wrap gap-2">
              {p.status === "proposed" ? (
                <Button disabled={busy} onClick={() => onDecision(p.id, true)}>
                  پذیرش اصلاح و بررسی دوباره
                </Button>
              ) : null}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => onDecision(p.id, false)}
              >
                رد پیشنهاد
              </Button>
            </div>
          ) : null}
        </article>
      ))}
      <FormMessage>{error}</FormMessage>
      {error ? (
        <Button variant="ghost" onClick={onRefresh} disabled={busy}>
          دریافت نسخه تازه
        </Button>
      ) : null}
      {!data.can_confirm && !data.confirmed ? (
        <StatusMessage>
          پیش از تأیید، نظرها و پیشنهادهای باز را تعیین تکلیف کنید.
        </StatusMessage>
      ) : null}
      {!data.confirmed ? (
        <div className="flex justify-end">
          <Button disabled={busy || !data.can_confirm} onClick={onConfirm}>
            {busy ? "در حال ثبت…" : "تأیید اطلاعات و ادامه"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
