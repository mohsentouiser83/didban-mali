"use client";

import Link from "next/link";
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
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [currencyUnit, setCurrencyUnit] = useState<"rial" | "toman">("rial");
  const [calendar, setCalendar] = useState<"jalali" | "gregorian">("jalali");
  const [profileName, setProfileName] = useState("");
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<"mapping" | "validation" | "commit" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [batchResult, previewResult] = await Promise.all([
        api<ImportBatch>(`/companies/${company.id}/imports/${batchId}`),
        api<ImportPreview>(`/companies/${company.id}/imports/${batchId}/preview`),
      ]);
      setBatch(batchResult);
      setPreview(previewResult);
      const stored = previewResult.mapping;
      setMapping(stored?.mapping ?? Object.fromEntries(previewResult.suggestions.map((item) => [item.target_field, item.source_column])));
      if (stored) { setCurrencyUnit(stored.currency_unit); setCalendar(stored.calendar); }
      if (batchResult.stage === "validation_ready" || completedStages.has(batchResult.stage)) {
        const issuePage = await api<IssuesPage>(`/companies/${company.id}/imports/${batchId}/issues?limit=200`);
        setIssues(issuePage.items);
        setIssueCounts(issuePage.items.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.severity]: (counts[item.severity] ?? 0) + 1 }), {}));
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "اطلاعات واردسازی دریافت نشد."); }
  }, [batchId, company.id]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const fields = useMemo(() => batch ? targetFields[batch.source_kind] : [], [batch]);
  const mappingComplete = Boolean(preview && preview.required_fields.every((field) => mapping[field]) && (!preview.alternative_required_fields.length || preview.alternative_required_fields.some((group) => group.every((field) => mapping[field]))));
  const canEdit = company.role !== "viewer" && !preview?.mapping;
  const isValidated = batch?.stage === "validation_ready" || (batch ? completedStages.has(batch.stage) : false);
  const isCommitted = batch ? completedStages.has(batch.stage) : false;

  async function saveMapping(event: FormEvent) {
    event.preventDefault(); if (!preview || !batch || !mappingComplete) return;
    setBusy("mapping"); setError(""); setNotice("");
    const cleanedMapping = Object.fromEntries(Object.entries(mapping).filter(([, source]) => source));
    try {
      await api<MappingResponse>(`/companies/${company.id}/imports/${batchId}/mapping`, { method: "PUT", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ sheet_name: preview.selected_sheet, header_row: preview.header_row, mapping: cleanedMapping, transforms: buildTransforms(cleanedMapping, currencyUnit), currency_unit: currencyUnit, calendar, profile_name: profileName.trim() || null }) });
      setNotice("نگاشت ستون‌ها ثبت شد. حالا می‌توانید کل فایل را اعتبارسنجی کنید."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ثبت نگاشت انجام نشد."); }
    finally { setBusy(null); }
  }

  async function validate() {
    setBusy("validation"); setError(""); setNotice("");
    try {
      const result = await api<ValidationResponse>(`/companies/${company.id}/imports/${batchId}/validate`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } });
      setBatch(result.batch); setIssueCounts(result.issue_counts);
      const issuePage = await api<IssuesPage>(`/companies/${company.id}/imports/${batchId}/issues?limit=200`);
      setIssues(issuePage.items); setNotice("اعتبارسنجی کامل شد؛ نتیجه و خطاهای قابل اصلاح پایین صفحه آمده است.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "اعتبارسنجی انجام نشد."); }
    finally { setBusy(null); }
  }

  async function commit() {
    setBusy("commit"); setError(""); setNotice("");
    try { const result = await api<ImportBatch>(`/companies/${company.id}/imports/${batchId}/commit`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } }); setBatch(result); setNotice("فایل برای نرمال‌سازی ثبت شد و پردازش آن در صف قرار گرفت."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "ثبت نهایی انجام نشد."); }
    finally { setBusy(null); }
  }

  if (!batch || !preview) return <section className="mapping-loading">{error ? <><Icon name="alert" /><h2>پیش‌نمایش آماده نیست</h2><p>{error}</p><Link className="secondary-button" href={`/companies/${company.id}/imports`}>بازگشت به فایل‌ها</Link></> : <><span className="loading-ring" /><p>در حال خواندن ساختار فایل…</p></>}</section>;

  return <div className="mapping-workspace">
    <header className="mapping-file-header"><div><Link className="back-link" href={`/companies/${company.id}/imports`}><Icon name="arrow" />بازگشت به فایل‌ها</Link><div className="file-title"><span className="file-state state-clean"><Icon name="file" /></span><div><h2>{batch.original_name}</h2><p>{sourceLabels[batch.source_kind]} · {batch.source_label}</p></div></div></div><span className={`status status-${batch.status}`}>{isCommitted ? "در صف نرمال‌سازی" : isValidated ? "اعتبارسنجی‌شده" : preview.mapping ? "نگاشت ثبت‌شده" : "نیازمند نگاشت"}</span></header>

    <ol className="workflow-steps" aria-label="مراحل آماده‌سازی داده"><li className="done"><span><Icon name="check" /></span><div><strong>فایل امن</strong><small>اسکن و پیش‌نمایش</small></div></li><li className={preview.mapping ? "done" : "current"}><span>{preview.mapping ? <Icon name="check" /> : "۲"}</span><div><strong>نگاشت ستون‌ها</strong><small>تأیید معنای داده</small></div></li><li className={isValidated ? "done" : preview.mapping ? "current" : ""}><span>{isValidated ? <Icon name="check" /> : "۳"}</span><div><strong>اعتبارسنجی</strong><small>کنترل همهٔ ردیف‌ها</small></div></li><li className={isCommitted ? "done" : isValidated ? "current" : ""}><span>{isCommitted ? <Icon name="check" /> : "۴"}</span><div><strong>ثبت نهایی</strong><small>ارسال به مدل مالی</small></div></li></ol>

    {error ? <p className="form-error global" role="alert">{error}</p> : null}{notice ? <p className="form-success global" role="status">{notice}</p> : null}

    <form className="mapping-layout" onSubmit={saveMapping}>
      <section className="mapping-panel" aria-labelledby="mapping-title"><div className="mapping-section-heading"><div><h3 id="mapping-title">معنای ستون‌ها را تأیید کنید</h3><p>پیشنهادها خودکارند، اما فقط با تأیید شما ثبت می‌شوند.</p></div><span>{Object.values(mapping).filter(Boolean).length} از {fields.length}</span></div><div className="mapping-rows">{fields.map((field) => { const required = isRequiredField(field, preview.required_fields, preview.alternative_required_fields); const suggestion = preview.suggestions.find((item) => item.target_field === field); return <label className="mapping-row" key={field}><span className="target-field"><strong>{fieldLabels[field] ?? field}</strong><small>{required ? "الزامی" : "اختیاری"}{suggestion ? ` · پیشنهاد ${new Intl.NumberFormat("fa-IR").format(suggestion.confidence)}٪` : ""}</small></span><Icon name="arrow" /><select value={mapping[field] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))} disabled={!canEdit}><option value="">انتخاب نشده</option>{preview.columns.map((column) => <option key={column} value={column} disabled={Object.entries(mapping).some(([target, source]) => target !== field && source === column)}>{column}</option>)}</select></label>; })}</div></section>
      <aside className="mapping-settings"><div><h3>قواعد تبدیل</h3><p>تبدیل تاریخ و مبلغ باید صریح و قابل حسابرسی باشد.</p></div><label>تقویم تاریخ‌ها<select value={calendar} onChange={(event) => setCalendar(event.target.value as "jalali" | "gregorian")} disabled={!canEdit}><option value="jalali">هجری شمسی</option><option value="gregorian">میلادی</option></select></label><label>واحد مبالغ<select value={currencyUnit} onChange={(event) => setCurrencyUnit(event.target.value as "rial" | "toman")} disabled={!canEdit}><option value="rial">ریال</option><option value="toman">تومان — تبدیل به ریال</option></select></label><label>نام الگو <span>(اختیاری)</span><input value={profileName} onChange={(event) => setProfileName(event.target.value)} disabled={!canEdit} placeholder="مثلاً خروجی نرم‌افزار سپیدار" /></label><div className="mapping-meta"><span>شیت</span><strong>{preview.selected_sheet}</strong><span>ردیف عنوان</span><strong>{new Intl.NumberFormat("fa-IR").format(preview.header_row)}</strong></div>{preview.mapping ? <div className="locked-note"><Icon name="shield" /><span><strong>نگاشت ثبت شده است</strong>نسخهٔ تأییدشده برای حفظ قابلیت حسابرسی تغییر نمی‌کند.</span></div> : <button className="primary-button" disabled={!mappingComplete || busy !== null}>{busy === "mapping" ? "در حال ثبت…" : "تأیید نگاشت"}</button>}</aside>
    </form>

    <section className="data-preview" aria-labelledby="preview-title"><div className="mapping-section-heading"><div><h3 id="preview-title">پیش‌نمایش داده</h3><p>نمونه‌ای از فایل اصلی؛ ردیف عنوان در محاسبات وارد نمی‌شود.</p></div><span>{new Intl.NumberFormat("fa-IR").format(preview.rows.length)} ردیف نمونه</span></div><div className="table-scroll"><table><thead><tr><th>ردیف</th>{preview.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{preview.rows.map((row) => <tr key={row.row_number}><td>{new Intl.NumberFormat("fa-IR").format(row.row_number)}</td>{preview.columns.map((column) => <td key={column} title={displayValue(row.raw[column])}>{displayValue(row.raw[column])}</td>)}</tr>)}</tbody></table></div></section>

    {preview.mapping ? <section className="validation-panel"><div className="validation-summary"><div><h3>کنترل کیفیت کل فایل</h3><p>{isValidated ? `${new Intl.NumberFormat("fa-IR").format(batch.accepted_count ?? 0)} ردیف پذیرفته و ${new Intl.NumberFormat("fa-IR").format(batch.rejected_count ?? 0)} ردیف رد شده است.` : "تمام ردیف‌ها با نگاشت تأییدشده بررسی می‌شوند."}</p></div>{!isValidated ? <button className="primary-button" onClick={() => void validate()} disabled={busy !== null}>{busy === "validation" ? "در حال اعتبارسنجی…" : "شروع اعتبارسنجی"}</button> : !isCommitted ? <button className="primary-button" onClick={() => void commit()} disabled={busy !== null || Boolean(issueCounts.blocking) || !(batch.accepted_count ?? 0)}>{busy === "commit" ? "در حال ثبت…" : "ثبت نهایی و نرمال‌سازی"}</button> : <span className="commit-complete"><Icon name="check" />در صف پردازش</span>}</div>{isValidated ? <><div className="quality-stats"><div><small>کل ردیف‌ها</small><strong>{new Intl.NumberFormat("fa-IR").format(batch.row_count ?? 0)}</strong></div><div className="quality-ok"><small>پذیرفته</small><strong>{new Intl.NumberFormat("fa-IR").format(batch.accepted_count ?? 0)}</strong></div><div className="quality-error"><small>ردشده</small><strong>{new Intl.NumberFormat("fa-IR").format(batch.rejected_count ?? 0)}</strong></div><div className="quality-warning"><small>هشدار</small><strong>{new Intl.NumberFormat("fa-IR").format(issueCounts.warning ?? 0)}</strong></div></div><IssuesList issues={issues} /></> : null}</section> : null}
  </div>;
}

function IssuesList({ issues }: { issues: ImportIssue[] }) {
  if (!issues.length) return <div className="issues-empty"><Icon name="check" /><span><strong>خطایی پیدا نشد</strong>داده‌های فایل با قواعد تأییدشده سازگارند.</span></div>;
  return <div className="issues-list"><div className="issues-title"><strong>موارد نیازمند توجه</strong><span>{new Intl.NumberFormat("fa-IR").format(issues.length)} مورد</span></div>{issues.map((issue) => <article key={issue.id}><span className={`issue-icon issue-${issue.severity}`}><Icon name="alert" /></span><div><strong>{issue.message}</strong><small>{issue.row_number ? `ردیف ${new Intl.NumberFormat("fa-IR").format(issue.row_number)}` : "سطح فایل"}{issue.field ? ` · ${fieldLabels[issue.field] ?? issue.field}` : ""}</small>{issue.remedy ? <p>{issue.remedy}</p> : null}</div>{issue.raw_value ? <code dir="ltr">{issue.raw_value}</code> : null}</article>)}</div>;
}
