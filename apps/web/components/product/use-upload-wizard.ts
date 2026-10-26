"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/product-api";
import { buildTransforms, targetFields, sourceLabels } from "@/lib/import-mapping";
import type { ImportLayout, InputScope, BankAccount, Company, ImportBatch, ImportPreview, IssuesPage, MappingResponse, ValidationResponse } from "@/lib/product-types";

export type UploadWizardProps = {
  request?: typeof api; company: Company; initialBatch?: ImportBatch | null; initialSourceKind?: ImportBatch["source_kind"]; onSaving: (busy: boolean) => void;
  onCancel: () => void; onUpdated: (batch: ImportBatch) => void; onDone: (batch: ImportBatch) => void;
};
export function downloadTemplate(type: ImportBatch["source_kind"]) {
  let headers = "";
  let sampleRow = "";
  let filename = "";

  if (type === "settlement_sales" || type === "settlement_purchases") {
    headers = "شناسه ردیف تسویه,تاریخ پرداخت,مبلغ تسویه,شماره مالیاتی صورتحساب,شماره فاکتور,شناسه اقتصادی / ملی طرف معامله,شناسه تراکنش,شماره شبا";
    sampleRow = "SET-1,1403/12/05,1000000,AAAAAAAAAAAAAAAAAAAAAA,,,123456,IR000000000000000000000000";
    filename = `template_${type}.csv`;
  } else if (type === "accounting") {
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


export function useUploadWizard({ company, initialBatch = null, initialSourceKind = "accounting", request = api, onSaving, onCancel, onUpdated, onDone }: UploadWizardProps) {
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
  const [accountStructure, setAccountStructure] = useState("flat");
  const [layout, setLayout] = useState<ImportLayout>({ header_rows: 1, fill_down_columns: [], invoice_rows: "records", invoice_direction: "mixed" });
  const [profileName, setProfileName] = useState("");
  const [scope, setScope] = useState<InputScope>({ completeness: "unknown", start_date: null, end_date: null });
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
    request<BankAccount[]>(`/companies/${company.id}/imports/bank-accounts`)
      .then((accounts) => {
        if (!active) return;
        setBankAccounts(accounts);
        setBankAccountId((current) => current === "new" || accounts.some((account) => account.id === current) ? current : accounts.length ? "" : "new");
      })
      .catch(() => { if (active) setAccountsError("حساب‌های بانکی دریافت نشد. دوباره تلاش کنید."); });
    return () => { active = false; };
  }, [company.id, sourceKind, initialBatch, accountsRetry, request]);
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
        const result = await request<ImportBatch>(`/companies/${company.id}/imports/${batchId}`);
        if (!active) return;
        setBatch(result); updatedRef.current(result);
        if (result.scan_status === "clean") setStep(2);
        else if (result.scan_status === "pending") timer = setTimeout(() => void poll(), 2000);
        else setScanError(result.failure_message ?? "بررسی امنیتی فایل ناموفق بود. فایل دیگری انتخاب کنید.");
      } catch { if (active) setScanError("وضعیت فایل دریافت نشد. دوباره تلاش کنید."); }
    }
    timer = setTimeout(() => void poll(), 1000);
    return () => { active = false; clearTimeout(timer); };
  }, [company.id, batchId, scanPending, retry, request]);

  useEffect(() => {
    if (!batchId || !scanClean) return;
    let active = true;
    setPreview(null); setPreviewError("");
    request<ImportPreview>(`/companies/${company.id}/imports/${batchId}/preview${previewQuery}`)
      .then((result) => {
        if (!active) return;
        setPreview(result); setHeaderRow(result.header_row); setSheet(result.selected_sheet);
        const suggested = Object.fromEntries(result.suggestions.map((suggestion) => [suggestion.target_field, suggestion.source_column]));
        for (const field of targetFields[sourceKind]) if (!suggested[field] && result.columns.includes(field)) suggested[field] = field;
        const confirmed = result.mapping?.mapping ?? result.matching_profile?.mapping ?? suggested;
        setMapping(confirmed);
        setLayout((current) => result.mapping?.layout ?? result.matching_profile?.layout ?? { ...current, header_rows: result.header_rows ?? 1 });
        if (result.mapping?.scope) setScope(result.mapping.scope);
        setAccountStructure(confirmed.general_code || confirmed.general_name ? "hierarchy" : "flat");
        setAmountMode(confirmed.amount_signed ? "net" : confirmed.deposit_amount || confirmed.withdrawal_amount || confirmed.debit || confirmed.credit ? "split" : "net");
        setCurrency(result.mapping?.currency_unit ?? result.matching_profile?.currency_unit ?? "rial");
        setCalendar(result.mapping?.calendar ?? result.matching_profile?.calendar ?? "jalali");
      })
      .catch((caught) => { if (active) setPreviewError(caught instanceof Error ? caught.message : "اطلاعات فایل دریافت نشد."); });
    return () => { active = false; };
  }, [company.id, batchId, scanClean, previewQuery, retry, sourceKind, request]);

  function setSaving(value: boolean) { setBusy(value); onSaving(value); }
  function selectFile(selected: File | undefined) {
    setError(""); setFile(null);
    if (!selected) return;
    if (!/\.(csv|xls|xlsx|pdf)$/i.test(selected.name)) { setError("فایل باید CSV، XLS، XLSX یا PDF متنی باشد."); return; }
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
      const result = await request<ImportBatch>(`/companies/${company.id}/imports/uploads`, { method: "POST", headers: { "Idempotency-Key": requestKey.current!.key }, body: form });
      setBatch(result); onUpdated(result);
      if (result.scan_status === "clean") setStep(2);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "بارگذاری فایل انجام نشد."); }
    finally { setSaving(false); }
  }
  const fields = preview ? targetFields[sourceKind] : [];
  const alternatives = preview?.alternative_required_fields ?? [];
  const hasAmounts = sourceKind === "bank" || sourceKind === "accounting";
  const activeAmounts = amountMode === "net" ? ["amount_signed"] : sourceKind === "accounting" ? ["debit", "credit"] : ["deposit_amount", "withdrawal_amount"];
  const inactiveAmounts = ["amount_signed", "debit", "credit", "deposit_amount", "withdrawal_amount"].filter((field) => !activeAmounts.includes(field));
  const accountFields = accountStructure === "flat" ? ["account_code", "account_name"] : ["general_code", "general_name"];
  const essential = fields.filter((field) => preview?.required_fields.includes(field) ||
    (hasAmounts && activeAmounts.includes(field)) ||
    (sourceKind === "accounting" ? accountFields.includes(field) : sourceKind !== "bank" && alternatives.some((group) => group.includes(field))));
  const optional = fields.filter((field) => !essential.includes(field) && !(hasAmounts && inactiveAmounts.includes(field)) &&
    !(sourceKind === "accounting" && (accountStructure === "flat" ? /^(general|subsidiary|detail)_/.test(field) : ["account_code", "account_name"].includes(field))));
  const mappingComplete = !!preview && preview.required_fields.every((field) => mapping[field]) &&
    (!alternatives.length || alternatives.some((group) => group.every((field) => mapping[field]))) &&
    (!hasAmounts || activeAmounts.every((field) => mapping[field])) &&
    sheet === preview.selected_sheet && headerRow === preview.header_row && layout.header_rows === (preview.header_rows ?? 1);
  const inheritanceTargets = new Set(["entry_id", "entry_date", "account_code", "account_name", "general_code", "general_name", "subsidiary_code", "subsidiary_name", "detail_code", "detail_name", "invoice_no", "tax_id", "issue_date", "party_name", "party_id", "customer_name", "customer_national_id", "subject", "reference_tax_id", "iban", "bank_account_number"]);
  const inheritedColumns = [...new Set(Object.entries(mapping).filter(([target, value]) => inheritanceTargets.has(target) && value).map(([, value]) => value))];
  const bankColumns = sourceKind === "bank" ? [mapping.iban, mapping.bank_account_number].filter(Boolean) : [];
  const invoices = ["sales", "purchases", "moadian_sales", "moadian_purchases"].includes(sourceKind) || (sourceKind === "accounting" && !!mapping.gross_amount);
  function changeAccountStructure(value: string) {
    setAccountStructure(value);
    setMapping((current) => Object.fromEntries(Object.entries(current).filter(([field]) =>
      value === "flat" ? !/^(general|subsidiary|detail)_/.test(field) : !["account_code", "account_name"].includes(field))));
  }
  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!batch || !preview || !mappingComplete || busy) return;
    if (validation) { setStep(3); return; }
    setSaving(true); setError("");
    try {
      if (!preview.mapping) {
        const cleaned = Object.fromEntries(Object.entries(mapping).filter(([, value]) => value));
        const saved = await request<MappingResponse>(`/companies/${company.id}/imports/${batch.id}/mapping`, {
          method: "PUT", headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ sheet_name: preview.selected_sheet, header_row: preview.header_row, mapping: cleaned, transforms: buildTransforms(cleaned, currency, layout.number_format ?? "standard"), currency_unit: currency, calendar, layout: { ...layout, fill_down_columns: layout.fill_down_columns.filter((column) => inheritedColumns.includes(column)) }, scope, profile_name: profileName.trim() || null }),
        });
        setPreview({ ...preview, mapping: saved });
      }
      let result: ValidationResponse;
      if (batch.retryable && (batch.accepted_count ?? 0) > 0) result = { batch, issue_counts: {}, coverage: batch.coverage ?? {} };
      else result = await request<ValidationResponse>(`/companies/${company.id}/imports/${batch.id}/validate`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } });
      setValidation(result); setBatch(result.batch); onUpdated(result.batch); setStep(3);
      if (Object.values(result.issue_counts).some((count) => count > 0)) {
        try { setIssues(await request<IssuesPage>(`/companies/${company.id}/imports/${batch.id}/issues?limit=20`)); }
        catch { setIssuesError(true); }
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تأیید اطلاعات انجام نشد."); }
    finally { setSaving(false); }
  }
  async function revise() {
    if (!batch || busy) return;
    setSaving(true); setError("");
    try {
      const revised = await request<ImportBatch>(`/companies/${company.id}/imports/${batch.id}/revise`, { method: "POST" });
      const params = new URLSearchParams({ sheet_name: sheet, header_row: String(headerRow), header_rows: String(layout.header_rows) });
      setPreviewQuery(`?${params}`); setValidation(null); setIssues(null); setIssuesError(false);
      setBatch(revised); setStep(2); onUpdated(revised);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ساختار برای اصلاح باز نشد."); }
    finally { setSaving(false); }
  }
  async function commit() {
    if (!batch || busy) return;
    setSaving(true); setError("");
    try {
      const result = await request<ImportBatch>(`/companies/${company.id}/imports/${batch.id}/commit`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } });
      onUpdated(result); onDone(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ثبت سند انجام نشد."); }
    finally { setSaving(false); }
  }
  return { batch, step, setStep, sourceKind, setSourceKind, sourceLabel, setSourceLabel, bankAccounts, bankAccountId, setBankAccountId, accountsError, setAccountsRetry, file, busy, error, scanError, previewError, setRetry, preview, amountMode, setAmountMode, mapping, setMapping, currency, setCurrency, calendar, setCalendar, headerRow, setHeaderRow, sheet, setSheet, setPreviewQuery, previewQuery, validation, issues, issuesError, bankReady, selectedAccount, upload, selectFile, confirm, commit, revise, mappingComplete, essential, optional, alternatives, hasAmounts, layout, setLayout, scope, setScope, inheritedColumns, bankColumns, profileName, setProfileName, invoices, accountStructure, changeAccountStructure };
}
