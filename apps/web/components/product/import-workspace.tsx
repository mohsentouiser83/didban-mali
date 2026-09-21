"use client";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "./product-card";
import { SelectField, SelectOption } from "./select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { buildTransforms, fieldLabels, isRequiredField, targetFields } from "@/lib/import-mapping";
import { api } from "@/lib/product-api";
import type { Company, ImportBatch, ImportIssue, ImportPreview, IssuesPage, MappingResponse, ValidationResponse } from "@/lib/product-types";

import { Icon } from "./icons";

const sourceLabels = { accounting: "دفتر حسابداری", bank: "گردش بانکی", sales: "فروش" };
const completedStages = new Set(["ready_for_normalization", "normalizing", "normalized"]);

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function ImportWorkspace({ company, batchId }: { company: Company; batchId: string }) {
  const router = useRouter();
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [headerRow, setHeaderRow] = useState<number | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [currencyUnit, setCurrencyUnit] = useState<"rial" | "toman">("rial");
  const [calendar, setCalendar] = useState<"jalali" | "gregorian">("jalali");
  const [profileName, setProfileName] = useState("");
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<"mapping" | "validation" | "commit" | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function deleteBatch() {
    if (!batch) return;
    setDeleting(true);
    setError("");
    try {
      await api(`/companies/${company.id}/imports/${batch.id}`, {
        method: "DELETE",
      });
      router.push(`/companies/${company.id}/imports`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "حذف فایل انجام نشد.");
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  }

  const load = useCallback(async (customHeaderRow?: number) => {
    setError("");
    try {
      const activeHeaderRow = customHeaderRow ?? headerRow;
      const previewUrl = activeHeaderRow && activeHeaderRow > 1
        ? `/companies/${company.id}/imports/${batchId}/preview?header_row=${activeHeaderRow}`
        : `/companies/${company.id}/imports/${batchId}/preview`;
      const [batchResult, previewResult] = await Promise.all([
        api<ImportBatch>(`/companies/${company.id}/imports/${batchId}`),
        api<ImportPreview>(previewUrl),
      ]);
      setBatch(batchResult);
      setPreview(previewResult);
      setHeaderRow(previewResult.header_row);
      const stored = previewResult.mapping;
      setMapping(
        stored?.mapping ??
          Object.fromEntries(previewResult.suggestions.map((item) => [item.target_field, item.source_column]))
      );
      if (stored) {
        setCurrencyUnit(stored.currency_unit);
        setCalendar(stored.calendar);
      }
      if (batchResult.stage === "validation_ready" || completedStages.has(batchResult.stage)) {
        const issuePage = await api<IssuesPage>(`/companies/${company.id}/imports/${batchId}/issues?limit=200`);
        setIssues(issuePage.items);
        setIssueCounts(
          issuePage.items.reduce<Record<string, number>>(
            (counts, item) => ({ ...counts, [item.severity]: (counts[item.severity] ?? 0) + 1 }),
            {}
          )
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "اطلاعات واردسازی دریافت نشد.");
    }
  }, [batchId, company.id, headerRow]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const fields = useMemo(() => (batch ? targetFields[batch.source_kind] : []), [batch]);
  const mappingComplete = Boolean(
    preview &&
      preview.required_fields.every((field) => mapping[field]) &&
      (!preview.alternative_required_fields.length ||
        preview.alternative_required_fields.some((group) => group.every((field) => mapping[field])))
  );
  const canEdit = company.role !== "viewer" && !preview?.mapping;
  const isValidated = batch?.stage === "validation_ready" || (batch ? completedStages.has(batch.stage) : false);
  const isCommitted = batch ? completedStages.has(batch.stage) : false;

  async function saveMapping(event: FormEvent) {
    event.preventDefault();
    if (!preview || !batch || !mappingComplete) return;
    setBusy("mapping");
    setError("");
    setNotice("");
    const cleanedMapping = Object.fromEntries(Object.entries(mapping).filter(([, source]) => source));
    try {
      await api<MappingResponse>(`/companies/${company.id}/imports/${batchId}/mapping`, {
        method: "PUT",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          sheet_name: preview.selected_sheet,
          header_row: headerRow ?? preview.header_row,
          mapping: cleanedMapping,
          transforms: buildTransforms(cleanedMapping, currencyUnit),
          currency_unit: currencyUnit,
          calendar,
          profile_name: profileName.trim() || null,
        }),
      });
      setNotice("نگاشت ستون‌ها ثبت شد. حالا می‌توانید کل فایل را اعتبارسنجی کنید.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ثبت نگاشت انجام نشد.");
    } finally {
      setBusy(null);
    }
  }

  async function validate() {
    setBusy("validation");
    setError("");
    setNotice("");
    try {
      const result = await api<ValidationResponse>(`/companies/${company.id}/imports/${batchId}/validate`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setBatch(result.batch);
      setIssueCounts(result.issue_counts);
      const issuePage = await api<IssuesPage>(`/companies/${company.id}/imports/${batchId}/issues?limit=200`);
      setIssues(issuePage.items);
      setNotice("اعتبارسنجی کامل شد؛ نتیجه و خطاهای قابل اصلاح پایین صفحه آمده است.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "اعتبارسنجی انجام نشد.");
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    setBusy("commit");
    setError("");
    setNotice("");
    try {
      const result = await api<ImportBatch>(`/companies/${company.id}/imports/${batchId}/commit`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setBatch(result);
      setNotice("فایل برای نرمال‌سازی ثبت شد و پردازش آن در صف قرار گرفت.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ثبت نهایی انجام نشد.");
    } finally {
      setBusy(null);
    }
  }

  if (!batch || !preview) {
    return (
      <section className="mapping-loading flex flex-col items-center justify-center min-h-[50vh] text-center p-8 space-y-4">
        {error ? (
          <>
            <Icon name="alert" className="size-8 text-destructive" />
            <h2 className="text-lg font-bold text-foreground">پیش‌نمایش آماده نیست</h2>
            <p className="text-xs text-muted-foreground max-w-sm">{error}</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href={`/companies/${company.id}/imports`}>بازگشت به فایل‌ها</Link>
            </Button>
          </>
        ) : (
          <>
            <span className="loading-ring size-6" />
            <p className="text-xs text-muted-foreground">در حال خواندن ساختار فایل…</p>
          </>
        )}
      </section>
    );
  }

  return (
    <div className="mapping-workspace space-y-6">
      <header className="mapping-file-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <Link
            className="back-link inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
            href={`/companies/${company.id}/imports`}
          >
            <Icon name="arrow" className="size-3.5" />
            بازگشت به فایل‌ها
          </Link>
          <div className="file-title flex items-center gap-3">
            <span className="file-state size-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Icon name="file" className="size-4" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground">{batch.original_name}</h2>
              <p className="text-xs text-muted-foreground">
                {sourceLabels[batch.source_kind]} · {batch.source_label}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <Badge variant="outline" className="status text-xs py-1 px-3">
            {isCommitted
              ? "در صف نرمال‌سازی"
              : isValidated
              ? "اعتبارسنجی‌شده"
              : preview.mapping
              ? "نگاشت ثبت‌شده"
              : "نیازمند نگاشت"}
          </Badge>
          {company.role !== "viewer" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="delete-link text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20 gap-1.5 h-8"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Icon name="trash" className="size-3.5" />
              <span>حذف سند</span>
            </Button>
          )}
        </div>
      </header>

      {/* Status & Alerts */}

      {error && (
        <Alert variant="destructive" className="form-error text-xs p-3.5 rounded-xl" role="alert">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert className="form-success text-xs p-3.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" role="status">
          {notice}
        </Alert>
      )}

      {/* Mapping Layout */}
      <form className="mapping-layout grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6" onSubmit={saveMapping}>
        <ProductCard className="mapping-panel p-6 rounded-2xl border border-border bg-card space-y-4" aria-labelledby="mapping-title">
          <div className="mapping-section-heading flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 id="mapping-title" className="text-base font-bold text-foreground">معنای ستون‌ها را تأیید کنید</h3>
                <span className="text-[11px] font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-md">
                  ردیف عناوین: {new Intl.NumberFormat("fa-IR").format(headerRow ?? preview.header_row)}
                </span>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg self-start sm:self-center">
              {Object.values(mapping).filter(Boolean).length} از {fields.length} نگاشت‌شده
            </span>
          </div>

          <div className="mapping-rows space-y-3">
            {fields.map((field) => {
              const required = isRequiredField(field, preview.required_fields, preview.alternative_required_fields);
              const suggestion = preview.suggestions.find((item) => item.target_field === field);
              return (
                <label
                  className="mapping-row flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                  key={field}
                >
                  <span className="target-field flex flex-col min-w-[140px]">
                    <strong className="text-xs font-bold text-foreground">{fieldLabels[field] ?? field}</strong>
                    <small className="text-[11px] text-muted-foreground font-normal mt-0.5">
                      {required ? "الزامی" : "اختیاری"}
                      {suggestion ? ` · پیشنهاد ${new Intl.NumberFormat("fa-IR").format(suggestion.confidence)}٪` : ""}
                    </small>
                  </span>
                  <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
                    <Icon name="arrow" className="size-3 text-muted-foreground shrink-0 hidden sm:block" />
                    <SelectField
                      value={mapping[field] ?? ""}
                      onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}
                      disabled={!canEdit}
                      className="h-9 text-xs w-full"
                    >
                      <SelectOption value="">انتخاب نشده</SelectOption>
                      {preview.columns.map((column) => (
                        <SelectOption
                          key={column}
                          value={column}
                          disabled={Object.entries(mapping).some(
                            ([target, source]) => target !== field && source === column
                          )}
                        >
                          {column}
                        </SelectOption>
                      ))}
                    </SelectField>
                  </div>
                </label>
              );
            })}
          </div>
        </ProductCard>

        <aside className="mapping-settings p-6 rounded-2xl border border-border bg-card space-y-4 self-start">
          <div className="border-b border-border/60 pb-3">
            <h3 className="text-base font-bold text-foreground">تنظیمات تبدیل و استانداردسازی</h3>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground">تقویم تاریخ‌ها</label>
            <SelectField
              value={calendar}
              onChange={(event) => setCalendar(event.target.value as "jalali" | "gregorian")}
              disabled={!canEdit}
              className="h-10 text-xs"
            >
              <SelectOption value="jalali">هجری شمسی</SelectOption>
              <SelectOption value="gregorian">میلادی</SelectOption>
            </SelectField>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground">واحد مبالغ</label>
            <SelectField
              value={currencyUnit}
              onChange={(event) => setCurrencyUnit(event.target.value as "rial" | "toman")}
              disabled={!canEdit}
              className="h-10 text-xs"
            >
              <SelectOption value="rial">ریال</SelectOption>
              <SelectOption value="toman">تومان — تبدیل به ریال</SelectOption>
            </SelectField>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <label>نام الگو</label>
              <span className="text-[11px] font-normal text-muted-foreground">اختیاری</span>
            </div>
            <Input
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              disabled={!canEdit}
              placeholder="مثلاً خروجی نرم‌افزار سپیدار"
              className="h-10 text-xs bg-background"
            />
          </div>

          <div className="mapping-meta flex items-center justify-between p-3 rounded-xl bg-muted/40 text-xs text-muted-foreground">
            <span>شیت: <strong className="text-foreground">{preview.selected_sheet}</strong></span>
            <div className="flex items-center gap-1.5">
              <span>ردیف عنوان:</span>
              {canEdit ? (
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={headerRow ?? preview.header_row}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1) {
                      setHeaderRow(val);
                      void load(val);
                    }
                  }}
                  className="w-12 h-7 text-center rounded border border-border bg-background text-foreground font-semibold text-xs"
                />
              ) : (
                <strong className="text-foreground">{new Intl.NumberFormat("fa-IR").format(preview.header_row)}</strong>
              )}
            </div>
          </div>

          {preview.mapping ? (
            <div className="locked-note flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
              <Icon name="shield" className="size-4 text-primary shrink-0 mt-0.5" />
              <span>
                <strong className="block font-semibold text-foreground">نگاشت ثبت شده است</strong>
                نسخهٔ تأییدشده برای حفظ قابلیت حسابرسی تغییر نمی‌کند.
              </span>
            </div>
          ) : (
            <Button
              type="submit"
              className="primary-button w-full h-10 text-xs font-bold gap-2"
              disabled={!mappingComplete || busy !== null}
            >
              {busy === "mapping" ? "در حال ثبت…" : "تأیید نگاشت"}
            </Button>
          )}
        </aside>
      </form>

      {/* Data Preview */}
      <ProductCard className="data-preview p-6 rounded-2xl border border-border bg-card space-y-4" aria-labelledby="preview-title">
        <div className="mapping-section-heading flex items-center justify-between border-b border-border/60 pb-3">
          <div>
            <h3 id="preview-title" className="text-base font-bold text-foreground">پیش‌نمایش داده</h3>
            <p className="text-xs text-muted-foreground">نمونه‌ای از فایل اصلی؛ ردیف عنوان در محاسبات وارد نمی‌شود.</p>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {new Intl.NumberFormat("fa-IR").format(preview.rows.length)} ردیف نمونه
          </span>
        </div>

        <div className="table-scroll overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-16 text-center text-xs">ردیف</TableHead>
                {preview.columns.map((column) => (
                  <TableHead key={column} className="text-xs whitespace-nowrap">
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((row) => (
                <TableRow key={row.row_number}>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                    {new Intl.NumberFormat("fa-IR").format(row.row_number)}
                  </TableCell>
                  {preview.columns.map((column) => (
                    <TableCell key={column} className="text-xs max-w-xs truncate" title={displayValue(row.raw[column])}>
                      {displayValue(row.raw[column])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ProductCard>

      {/* Validation Panel */}
      {preview.mapping && (
        <ProductCard className="validation-panel p-6 rounded-2xl border border-border bg-card space-y-6">
          <div className="validation-summary flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-4">
            <div>
              <h3 className="text-base font-bold text-foreground">کنترل کیفیت کل فایل</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isValidated
                  ? `${new Intl.NumberFormat("fa-IR").format(batch.accepted_count ?? 0)} ردیف پذیرفته و ${new Intl.NumberFormat(
                      "fa-IR"
                    ).format(batch.rejected_count ?? 0)} ردیف رد شده است.`
                  : "تمام ردیف‌ها با نگاشت تأییدشده بررسی می‌شوند."}
              </p>
            </div>

            {!isValidated ? (
              <Button
                className="primary-button h-10 text-xs font-bold gap-2 self-start sm:self-center"
                onClick={() => void validate()}
                disabled={busy !== null}
              >
                {busy === "validation" ? "در حال اعتبارسنجی…" : "شروع اعتبارسنجی"}
              </Button>
            ) : !isCommitted ? (
              <Button
                className="primary-button h-10 text-xs font-bold gap-2 self-start sm:self-center"
                onClick={() => void commit()}
                disabled={busy !== null || Boolean(issueCounts.blocking) || !(batch.accepted_count ?? 0)}
              >
                {busy === "commit" ? "در حال ثبت…" : "ثبت نهایی و نرمال‌سازی"}
              </Button>
            ) : (
              <Badge variant="outline" className="commit-complete bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-xs gap-1.5 py-1.5 px-3">
                <Icon name="check" className="size-3.5" />
                در صف پردازش
              </Badge>
            )}
          </div>

          {isValidated && (
            <>
              <div className="quality-stats grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-muted/40 border border-border/60 text-center">
                <div>
                  <small className="block text-[11px] text-muted-foreground mb-1">کل ردیف‌ها</small>
                  <strong className="text-sm font-bold text-foreground font-mono">
                    {new Intl.NumberFormat("fa-IR").format(batch.row_count ?? 0)}
                  </strong>
                </div>
                <div>
                  <small className="block text-[11px] text-muted-foreground mb-1">پذیرفته</small>
                  <strong className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {new Intl.NumberFormat("fa-IR").format(batch.accepted_count ?? 0)}
                  </strong>
                </div>
                <div>
                  <small className="block text-[11px] text-muted-foreground mb-1">ردشده</small>
                  <strong className="text-sm font-bold text-destructive font-mono">
                    {new Intl.NumberFormat("fa-IR").format(batch.rejected_count ?? 0)}
                  </strong>
                </div>
                <div>
                  <small className="block text-[11px] text-muted-foreground mb-1">هشدار</small>
                  <strong className="text-sm font-bold text-amber-600 dark:text-amber-400 font-mono">
                    {new Intl.NumberFormat("fa-IR").format(issueCounts.warning ?? 0)}
                  </strong>
                </div>
              </div>
              <IssuesList issues={issues} />
            </>
          )}
        </ProductCard>
      )}

      <Dialog open={showDeleteDialog} onOpenChange={(open) => { if (!open && !deleting) setShowDeleteDialog(false); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Icon name="trash" className="size-5 text-destructive" />
              حذف سند مالی
            </DialogTitle>
            <DialogDescription>
              آیا از حذف فایل «<strong className="text-foreground">{batch.original_name}</strong>» اطمینان دارید؟ تمامی ردیف‌ها و داده‌های استخراج‌شده از این سند به طور کامل حذف خواهند شد. این عملیات غیرقابل بازگشت است.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleting}
            >
              انصراف
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={deleteBatch}
              disabled={deleting}
              className="gap-1.5"
            >
              <Icon name="trash" className="size-4" />
              {deleting ? "در حال حذف…" : "حذف قطعی سند"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IssuesList({ issues }: { issues: ImportIssue[] }) {
  if (!issues.length) {
    return (
      <div className="issues-empty flex items-center justify-center gap-2 p-6 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-400">
        <Icon name="check" className="size-4" />
        <span>
          <strong className="font-bold">خطایی پیدا نشد: </strong>
          داده‌های فایل با قواعد تأییدشده سازگارند.
        </span>
      </div>
    );
  }

  return (
    <div className="issues-list space-y-3">
      <div className="issues-title flex items-center justify-between border-b border-border/60 pb-2">
        <strong className="text-xs font-bold text-foreground">موارد نیازمند توجه</strong>
        <span className="text-[11px] font-mono text-muted-foreground">
          {new Intl.NumberFormat("fa-IR").format(issues.length)} مورد
        </span>
      </div>

      <div className="space-y-2">
        {issues.map((issue) => (
          <article
            key={issue.id}
            className="flex items-start justify-between gap-3 p-3 rounded-xl border border-border/60 bg-muted/20 text-xs"
          >
            <div className="flex items-start gap-2.5">
              <span
                className={`issue-icon size-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  issue.severity === "blocking"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}
              >
                <Icon name="alert" className="size-3.5" />
              </span>
              <div className="space-y-0.5">
                <strong className="block font-bold text-foreground">{issue.message}</strong>
                <small className="block text-[11px] text-muted-foreground">
                  {issue.row_number
                    ? `ردیف ${new Intl.NumberFormat("fa-IR").format(issue.row_number)}`
                    : "سطح فایل"}
                  {issue.field ? ` · ${fieldLabels[issue.field] ?? issue.field}` : ""}
                </small>
                {issue.remedy && <p className="text-[11px] text-muted-foreground/90 mt-1">{issue.remedy}</p>}
              </div>
            </div>

            {issue.raw_value && (
              <code dir="ltr" className="px-2 py-1 rounded bg-muted text-[11px] font-mono shrink-0">
                {issue.raw_value}
              </code>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
