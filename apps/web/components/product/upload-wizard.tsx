"use client";
import { FieldDescription } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form";
import { ErrorState, LoadingState, toPersianDigits } from "@/components/ui/financial";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/product-api";
import { buildTransforms, fieldLabels, targetFields, sourceLabels } from "@/lib/import-mapping";
import type { BankAccount, Company, ImportBatch, ImportPreview, IssuesPage, MappingResponse, ValidationResponse } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DrawerFooter, DrawerDetails, DrawerForm } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "@/components/ui/icons";
import formStyles from "./reports-workspace.module.css";
import styles from "./upload-wizard.module.css";

function downloadTemplate(type: ImportBatch["source_kind"]) {
  let headers = "";
  let sampleRow = "";
  let filename = "";

  if (type === "accounting") {
    headers =
      "تاریخ سند,شماره سند,کد معین,نام حساب,شرح آرتیکل,بدهکار (ریال),بستانکار (ریال),کد پیگیری";
    sampleRow =
      "1405/01/15,1024,1101,صندوق مرکزی,دریافت از مشتری بابت تسویه فاکتور,50000000,0,TRX-9821";
    filename = "template_accounting_journal.csv";
  } else if (type === "bank") {
    headers =
      "تاریخ تراکنش,زمان,شماره پیگیری,شرح تراکنش,واریز (ریال),برداشت (ریال),مانده (ریال)";
    sampleRow =
      "1405/01/15,14:32:10,98234120,انتقال پایا از شرکت الف,50000000,0,245000000";
    filename = "template_bank_statement.csv";
  } else if (type !== "sales") {
    headers = "شماره فاکتور,شماره مالیاتی صورتحساب,تاریخ صدور,طرف معامله,شناسه اقتصادی / ملی طرف معامله,مبلغ کل,مالیات,موضوع صورتحساب,شماره مالیاتی مرجع,وضعیت";
    sampleRow = "INV-1,A111DW04E8300004349008,1405/01/10,شرکت نمونه,14000000001,110000000,10000000,اصلی,,تایید شده";
    filename = `template_${type}.csv`;
  } else {
    headers =
      "شماره فاکتور,تاریخ صدور,کد مشتری,نام مشتری,مبلغ فاکتور (ریال),مهلت تسویه (روز),وضعیت";
    sampleRow =
      "INV-1405-01,1405/01/10,CUST-102,شرکت رایان سیستم,120000000,30,صادرشده";
    filename = "template_sales_invoices.csv";
  }

  const csvContent = "\uFEFF" + headers + "\n" + sampleRow + "\n";
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function UploadWizard({ company, initialBatch = null, initialSourceKind = "accounting", onSaving, onCancel, onUpdated, onDone }: {
  company: Company; initialBatch?: ImportBatch | null; initialSourceKind?: ImportBatch["source_kind"]; onSaving: (busy: boolean) => void;
  onCancel: () => void; onUpdated: (batch: ImportBatch) => void; onDone: (batch: ImportBatch) => void;
}) {
  const [batch, setBatch] = useState<ImportBatch | null>(initialBatch);
  const [step, setStep] = useState(initialBatch?.scan_status === "clean" ? 2 : 1);
  const [sourceKind, setSourceKind] = useState<ImportBatch["source_kind"]>(initialBatch?.source_kind ?? initialSourceKind);
  const [sourceLabel, setSourceLabel] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[] | null>(null);
  const [bankAccountId, setBankAccountId] = useState("");
  const [accountsError, setAccountsError] = useState("");
  const [accountsRetry, setAccountsRetry] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanError, setScanError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [retry, setRetry] = useState(0);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [amountMode, setAmountMode] = useState("net");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState<"rial" | "toman">("rial");
  const [calendar, setCalendar] = useState<"jalali" | "gregorian">("jalali");
  const [headerRow, setHeaderRow] = useState(1);
  const [sheet, setSheet] = useState("");
  const [previewQuery, setPreviewQuery] = useState("");
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [issues, setIssues] = useState<IssuesPage | null>(null);
  const [issuesError, setIssuesError] = useState(false);
  const requestKey = useRef<{ file: File; kind: string; label: string; account: string; key: string } | null>(null);
  const updatedRef = useRef(onUpdated);
  useEffect(() => { updatedRef.current = onUpdated; }, [onUpdated]);
  useEffect(() => {
    if (sourceKind !== "bank" || initialBatch) return;
    let active = true;
    setBankAccounts(null); setAccountsError("");
    api<BankAccount[]>(`/companies/${company.id}/imports/bank-accounts`)
      .then((accounts) => {
        if (!active) return;
        setBankAccounts(accounts);
        setBankAccountId((current) => current === "new" || accounts.some((account) => account.id === current) ? current : accounts.length ? "" : "new");
      })
      .catch(() => { if (active) setAccountsError("حساب‌های بانکی دریافت نشد. دوباره تلاش کنید."); });
    return () => { active = false; };
  }, [company.id, sourceKind, initialBatch, accountsRetry]);
  const selectedAccount = bankAccounts?.find((account) => account.id === bankAccountId);
  const bankReady = sourceKind !== "bank" || (!!bankAccounts && (bankAccountId === "new" ? sourceLabel.trim().length >= 2 : !!selectedAccount));
  const batchId = batch?.id;
  const scanPending = !!batch && batch.scan_status === "pending";
  const scanClean = batch?.scan_status === "clean";
  useEffect(() => {
    if (!batchId || !scanPending) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setScanError("");
    async function poll() {
      try {
        const result = await api<ImportBatch>(`/companies/${company.id}/imports/${batchId}`);
        if (!active) return;
        setBatch(result); updatedRef.current(result);
        if (result.scan_status === "clean") setStep(2);
        else if (result.scan_status === "pending") timer = setTimeout(() => void poll(), 2000);
        else setScanError(result.failure_message ?? "بررسی امنیتی فایل ناموفق بود. فایل دیگری انتخاب کنید.");
      } catch { if (active) setScanError("وضعیت فایل دریافت نشد. دوباره تلاش کنید."); }
    }
    timer = setTimeout(() => void poll(), 1000);
    return () => { active = false; clearTimeout(timer); };
  }, [company.id, batchId, scanPending, retry]);

  useEffect(() => {
    if (!batchId || !scanClean) return;
    let active = true;
    setPreview(null); setPreviewError("");
    api<ImportPreview>(`/companies/${company.id}/imports/${batchId}/preview${previewQuery}`)
      .then((result) => {
        if (!active) return;
        setPreview(result); setHeaderRow(result.header_row); setSheet(result.selected_sheet);
        const suggested = Object.fromEntries(result.suggestions.map((suggestion) => [suggestion.target_field, suggestion.source_column]));
        for (const field of targetFields[sourceKind]) if (!suggested[field] && result.columns.includes(field)) suggested[field] = field;
        const confirmed = result.mapping?.mapping ?? suggested;
        setMapping(confirmed);
        setAmountMode(confirmed.amount_signed ? "net" : confirmed.deposit_amount || confirmed.withdrawal_amount ? "split" : "net");
        setCurrency(result.mapping?.currency_unit ?? result.matching_profile?.currency_unit ?? "rial");
        setCalendar(result.mapping?.calendar ?? result.matching_profile?.calendar ?? "jalali");
      })
      .catch((caught) => { if (active) setPreviewError(caught instanceof Error ? caught.message : "اطلاعات فایل دریافت نشد."); });
    return () => { active = false; };
  }, [company.id, batchId, scanClean, previewQuery, retry, sourceKind]);

  function setSaving(value: boolean) { setBusy(value); onSaving(value); }
  function selectFile(selected: File | undefined) {
    setError(""); setFile(null);
    if (!selected) return;
    if (!/\.(csv|xls|xlsx|pdf)$/i.test(selected.name)) { setError("فایل باید CSV، XLS، XLSX یا PDF بانک باشد."); return; }
    if (/\.pdf$/i.test(selected.name) && sourceKind !== "bank") { setError("PDF فقط برای صورتحساب بانک قابل ورود است."); return; }
    if (!selected.size || selected.size > 50 * 1024 * 1024) { setError("فایل باید غیرخالی و حداکثر ۵۰ مگابایت باشد."); return; }
    setFile(selected);
  }
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file || busy || !bankReady) return;
    setSaving(true); setError("");
    const label = sourceKind === "bank" && selectedAccount ? selectedAccount.label : sourceLabel.trim() || sourceLabels[sourceKind];
    const account = sourceKind === "bank" && selectedAccount ? selectedAccount.id : "";
    const previous = requestKey.current;
    if (!previous || previous.file !== file || previous.kind !== sourceKind || previous.label !== label || previous.account !== account) requestKey.current = { file, kind: sourceKind, label, account, key: crypto.randomUUID() };
    const form = new FormData(); form.set("source_kind", sourceKind); form.set("source_label", label); form.set("file", file);
    if (account) form.set("bank_account_id", account);
    try {
      const result = await api<ImportBatch>(`/companies/${company.id}/imports/uploads`, { method: "POST", headers: { "Idempotency-Key": requestKey.current!.key }, body: form });
      setBatch(result); onUpdated(result);
      if (result.scan_status === "clean") setStep(2);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "بارگذاری فایل انجام نشد."); }
    finally { setSaving(false); }
  }
  const mappingComplete = !!preview && preview.required_fields.every((field) => mapping[field]) && (!preview.alternative_required_fields.length || preview.alternative_required_fields.some((group) => group.every((field) => mapping[field])));
  const fields = preview ? targetFields[sourceKind] : [];
  const alternatives = preview?.alternative_required_fields ?? [];
  const activeAmounts = amountMode === "net" ? ["amount_signed"] : ["deposit_amount", "withdrawal_amount"];
  const essential = fields.filter((field) => preview?.required_fields.includes(field) || (alternatives.length > 0 && activeAmounts.includes(field)));
  const optional = fields.filter((field) => !preview?.required_fields.includes(field) && !alternatives.some((group) => group.includes(field)));
  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!batch || !preview || !mappingComplete || busy) return;
    if (validation) { setStep(3); return; }
    setSaving(true); setError("");
    try {
      if (!preview.mapping) {
        const cleaned = Object.fromEntries(Object.entries(mapping).filter(([, value]) => value));
        const saved = await api<MappingResponse>(`/companies/${company.id}/imports/${batch.id}/mapping`, {
          method: "PUT", headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ sheet_name: preview.selected_sheet, header_row: preview.header_row, mapping: cleaned, transforms: buildTransforms(cleaned, currency), currency_unit: currency, calendar, profile_name: null }),
        });
        setPreview({ ...preview, mapping: saved });
      }
      let result: ValidationResponse;
      if (batch.retryable && (batch.accepted_count ?? 0) > 0) result = { batch, issue_counts: {}, coverage: batch.coverage ?? {} };
      else result = await api<ValidationResponse>(`/companies/${company.id}/imports/${batch.id}/validate`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } });
      setValidation(result); setBatch(result.batch); onUpdated(result.batch); setStep(3);
      if (Object.values(result.issue_counts).some((count) => count > 0)) {
        try { setIssues(await api<IssuesPage>(`/companies/${company.id}/imports/${batch.id}/issues?limit=20`)); }
        catch { setIssuesError(true); }
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تأیید اطلاعات انجام نشد."); }
    finally { setSaving(false); }
  }
  async function commit() {
    if (!batch || busy) return;
    setSaving(true); setError("");
    try {
      const result = await api<ImportBatch>(`/companies/${company.id}/imports/${batch.id}/commit`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } });
      onUpdated(result); onDone(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ثبت سند انجام نشد."); }
    finally { setSaving(false); }
  }
  function fieldSelect(field: string) {
    return <div key={field}><label htmlFor={`column-${field}`}>{fieldLabels[field] ?? field}{preview?.required_fields.includes(field) ? " *" : ""}</label><Select dir="rtl" value={mapping[field] || "none"} disabled={busy || !!preview?.mapping} onValueChange={(value) => setMapping((current) => ({ ...current, [field]: value === "none" ? "" : value }))}><SelectTrigger id={`column-${field}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">انتخاب نشده</SelectItem>{preview?.columns.map((column) => <SelectItem key={column} value={column}>{column}</SelectItem>)}</SelectContent></Select></div>;
  }
  return <div className={styles.content}>
    <ol className={styles.steps} aria-label="مراحل بارگذاری">{["انتخاب فایل", "تأیید اطلاعات", "ثبت سند"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} data-active={step === index + 1}><span>{toPersianDigits(index + 1)}</span>{label}</li>)}</ol>
    {step === 1 && !batch && <DrawerForm onSubmit={(event) => void upload(event)}>
      <div><label htmlFor="import-kind" className="mb-2 block text-sm">نوع سند</label><Select dir="rtl" value={sourceKind} disabled={busy} onValueChange={(value) => setSourceKind(value as ImportBatch["source_kind"])}><SelectTrigger id="import-kind"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(sourceLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      {sourceKind === "bank" && <div>
        <label htmlFor="import-bank-account">حساب بانکی</label>
        {accountsError ? <ErrorState onRetry={() => setAccountsRetry((value) => value + 1)} variant="compact" ><p>{accountsError}</p></ErrorState> : bankAccounts === null ? <LoadingState variant="inline" >در حال دریافت حساب‌ها…</LoadingState> : <>
          <Select dir="rtl" value={bankAccountId} disabled={busy} onValueChange={setBankAccountId}>
            <SelectTrigger id="import-bank-account"><SelectValue placeholder="انتخاب حساب بانکی" /></SelectTrigger>
            <SelectContent>{bankAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.label}{account.account_last4 ? ` — ${account.account_last4}` : ""}</SelectItem>)}<SelectItem value="new">افزودن حساب جدید</SelectItem></SelectContent>
          </Select>

        </>}
      </div>}
      {(sourceKind !== "bank" || bankAccountId === "new") && <div><label htmlFor="import-label">{sourceKind === "bank" ? "نام حساب جدید" : "عنوان منبع (اختیاری)"}</label><Input id="import-label" maxLength={160} minLength={sourceKind === "bank" ? 2 : undefined} required={sourceKind === "bank"} placeholder={sourceKind === "bank" ? "مثلاً بانک ملت — حساب جاری شرکت" : "مثلاً دفتر حسابداری مهر"} value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} disabled={busy} /></div>}
      <div className="grid min-w-0 gap-2"><label htmlFor="import-file">فایل سند</label><FileInput id="import-file" fileName={file?.name} accept=".csv,.xls,.xlsx,.pdf" disabled={busy} onChange={(event) => selectFile(event.target.files?.[0])} aria-invalid={error ? true : undefined} aria-describedby={["import-file-hint", error ? "import-file-error" : ""].filter(Boolean).join(" ")} /><FieldDescription id="import-file-hint">CSV، XLS، XLSX یا PDF بانک، حداکثر ۵۰ مگابایت</FieldDescription></div>
      <Button type="button" variant="outline" onClick={() => downloadTemplate(sourceKind)} disabled={busy}><Download size={16} aria-hidden="true" />دریافت فایل نمونه</Button>
      {error && <FormMessage id="import-file-error">{error}</FormMessage>}
      <DrawerFooter><Button type="button" variant="outline" onClick={onCancel} disabled={busy}>انصراف</Button><Button type="submit" disabled={busy || !file || !bankReady}>{busy ? "در حال بارگذاری…" : "ادامه"}</Button></DrawerFooter>
    </DrawerForm>}
    {step === 1 && batch && <><p className={formStyles.note}><bdi>{batch.original_name}</bdi></p><LoadingState variant="inline" >در حال بررسی فایل…</LoadingState>{(scanError || batch.failure_message) && <ErrorState onRetry={() => setRetry((value) => value + 1)} variant="compact" ><p>{scanError || batch.failure_message}</p></ErrorState>}<DrawerFooter><Button variant="outline" onClick={onCancel}>بستن</Button></DrawerFooter></>}
    {step === 2 && <>{previewError ? <ErrorState onRetry={() => setRetry((value) => value + 1)} variant="compact" ><p>{previewError}</p></ErrorState> : !preview ? <Skeleton className="h-48 w-full" /> : <DrawerForm onSubmit={(event) => void confirm(event)}>
      <p className={formStyles.note}><bdi>{batch?.original_name}</bdi></p>
      <div className={styles.fields}>
        <div><label htmlFor="import-currency">واحد مبلغ</label><Select dir="rtl" value={currency} onValueChange={(value) => setCurrency(value as "rial" | "toman")} disabled={busy || !!preview.mapping}><SelectTrigger id="import-currency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="rial">ریال</SelectItem><SelectItem value="toman">تومان</SelectItem></SelectContent></Select></div>
        <div><label htmlFor="import-calendar">تقویم تاریخ‌ها</label><Select dir="rtl" value={calendar} onValueChange={(value) => setCalendar(value as "jalali" | "gregorian")} disabled={busy || !!preview.mapping}><SelectTrigger id="import-calendar"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="jalali">شمسی</SelectItem><SelectItem value="gregorian">میلادی</SelectItem></SelectContent></Select></div>
      </div>
      {!!alternatives.length && <div><label htmlFor="amount-mode">ساختار مبلغ</label><Select dir="rtl" value={amountMode} disabled={busy || !!preview.mapping} onValueChange={(value) => {
        setAmountMode(value); setMapping((current) => { const next = { ...current }; for (const field of value === "net" ? ["deposit_amount", "withdrawal_amount"] : ["amount_signed"]) delete next[field]; return next; });
      }}><SelectTrigger id="amount-mode"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="net">یک ستون مبلغ خالص</SelectItem><SelectItem value="split">دو ستون واریز و برداشت</SelectItem></SelectContent></Select></div>}
      <div className={styles.fields}>{essential.map(fieldSelect)}</div>
      <details className={styles.options}><summary>ستون‌های اختیاری و تنظیمات فایل</summary><div className={styles.fields}>
        <div><label htmlFor="import-sheet">شیت</label><Select dir="rtl" value={sheet} disabled={busy || !!preview.mapping} onValueChange={setSheet}><SelectTrigger id="import-sheet"><SelectValue /></SelectTrigger><SelectContent>{preview.sheets.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        <div><label htmlFor="import-header">ردیف عنوان</label><Input id="import-header" type="number" min={1} max={100} value={headerRow} disabled={busy || !!preview.mapping} onChange={(event) => setHeaderRow(Number(event.target.value))} /></div>
        {!preview.mapping && <Button type="button" variant="outline" disabled={busy || !Number.isInteger(headerRow) || headerRow < 1 || headerRow > 100} onClick={() => { const params = new URLSearchParams({ sheet_name: sheet, header_row: String(headerRow) }); const next = `?${params}`; if (next === previewQuery) setRetry((value) => value + 1); else setPreviewQuery(next); }}>خواندن ستون‌ها</Button>}
        {optional.map(fieldSelect)}
      </div></details>
      {batch?.duplicate_detected && <p className={formStyles.caption}>این فایل قبلاً بارگذاری شده است.</p>}
      {error && <FormMessage>{error}</FormMessage>}
      <DrawerFooter><Button type="button" variant="outline" onClick={onCancel} disabled={busy}>بستن</Button><Button type="submit" disabled={busy || !mappingComplete}>{busy ? "در حال بررسی…" : "ادامه"}</Button></DrawerFooter>
    </DrawerForm>}</>}
    {step === 3 && batch && <>
      <p className={formStyles.note}><bdi>{batch.original_name}</bdi></p>
      <DrawerDetails><div><dt>کل ردیف‌ها</dt><dd>{toPersianDigits(batch.row_count ?? 0)}</dd></div><div><dt>قابل ثبت</dt><dd>{toPersianDigits(batch.accepted_count ?? 0)}</dd></div><div><dt>ردیف‌های دارای خطا</dt><dd>{toPersianDigits(batch.rejected_count ?? 0)}</dd></div></DrawerDetails>
      {(batch.rejected_count ?? 0) > 0 && <p className={formStyles.caption}>ردیف‌های دارای خطا ثبت نمی‌شوند. پس از ثبت، جزئیات آن‌ها در صفحه ردیف‌ها در دسترس است.</p>}
      {issues?.items.length ? <details className={styles.options}><summary>مشاهده ایرادها ({toPersianDigits(issues.total)})</summary><ul className={styles.issues}>{issues.items.map((issue) => <li key={issue.id}>ردیف {toPersianDigits(issue.row_number ?? "—")} · {issue.message}{issue.remedy && <p className={formStyles.caption}>{issue.remedy}</p>}</li>)}</ul></details> : null}
      {issuesError && <FormMessage>جزئیات ایرادها دریافت نشد. برای بررسی آن‌ها صفحه ردیف‌های سند را باز کنید.</FormMessage>}
      {batch.failure_message && <FormMessage>{batch.failure_message}</FormMessage>}
      {error && <FormMessage>{error}</FormMessage>}
      <DrawerFooter><Button variant="outline" onClick={() => setStep(2)} disabled={busy}>قبلی</Button><Button variant="outline" onClick={onCancel} disabled={busy}>بستن</Button><Button onClick={() => void commit()} disabled={busy || !validation || (batch.accepted_count ?? 0) < 1 || !!validation.issue_counts.blocking}>{busy ? "در حال ثبت…" : "ثبت سند"}</Button></DrawerFooter>
    </>}
  </div>;
}
