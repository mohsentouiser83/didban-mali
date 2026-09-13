"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { api } from "@/lib/product-api";
import type { AccountClass, AccountClassification, Company, FinancialAccount, ImportBatch } from "@/lib/product-types";

import { Icon } from "./icons";

const classLabels: Record<AccountClass, string> = { asset: "دارایی", liability: "بدهی", equity: "حقوق مالکانه", revenue: "درآمد", expense: "هزینه", other: "سایر" };
const today = new Date().toISOString().slice(0, 10);

type CoverageSection = { score?: number; available?: boolean; reasons?: string[]; normalized_rows?: number; expected_rows?: number; lineage_complete?: boolean };
type Coverage = { overall?: number; canonical_model?: CoverageSection; journal_balance?: CoverageSection; profit_analysis?: CoverageSection };

function scoreOf(value: unknown) { return typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0; }

export function FinancialModelWorkspace({ company }: { company: Company }) {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [normalizedBatches, setNormalizedBatches] = useState<ImportBatch[]>([]);
  const [initialCount, setInitialCount] = useState(0);
  const [selectedClasses, setSelectedClasses] = useState<Record<string, AccountClass | "">>({});
  const [effectiveDates, setEffectiveDates] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [accountResults, imports] = await Promise.all([
        api<FinancialAccount[]>(`/companies/${company.id}/accounts/unclassified`),
        api<ImportBatch[]>(`/companies/${company.id}/imports`),
      ]);
      setAccounts(accountResults);
      setInitialCount((current) => Math.max(current, accountResults.length));
      setNormalizedBatches(imports.filter((item) => item.stage === "normalized"));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "مدل مالی دریافت نشد."); }
    finally { setLoading(false); }
  }, [company.id]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const latestCoverage = (normalizedBatches[0]?.coverage ?? {}) as Coverage;
  const classifiedCount = Math.max(0, initialCount - accounts.length);
  const completion = initialCount ? Math.round((classifiedCount / initialCount) * 100) : 100;
  const canClassify = company.role !== "viewer";

  async function classify(event: FormEvent<HTMLFormElement>, account: FinancialAccount) {
    event.preventDefault();
    const accountClass = selectedClasses[account.id];
    if (!accountClass) { setError("برای ثبت، طبقهٔ حساب را انتخاب کنید."); return; }
    setBusyId(account.id); setError(""); setNotice("");
    try {
      await api<AccountClassification>(`/companies/${company.id}/accounts/${account.id}/classification`, { method: "PUT", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ account_class: accountClass, effective_from: effectiveDates[account.id] ?? today, rule_version: "human-v1" }) });
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      setNotice(`حساب «${account.name}» در طبقهٔ ${classLabels[accountClass]} ثبت شد.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "طبقه‌بندی حساب ثبت نشد."); }
    finally { setBusyId(null); }
  }

  if (loading) return <FinancialModelSkeleton />;

  return <div className="financial-model-workspace">
    <section className="model-intro"><div><span className="model-kicker"><Icon name="layers" />مدل مالی کانونیکال</span><h2>دادهٔ خام به ساختار قابل تحلیل تبدیل شده است</h2><p>پوشش نرمال‌سازی و تراز اسناد را ببینید؛ سپس حساب‌های باقی‌مانده را برای محاسبات سود و زیان طبقه‌بندی کنید.</p></div><div className="model-readiness"><span>آمادگی تحلیل</span><strong>{scoreOf(latestCoverage.profit_analysis?.score)}٪</strong><div className="readiness-track"><i style={{ width: `${scoreOf(latestCoverage.profit_analysis?.score)}%` }} /></div></div></section>

    {error ? <p className="form-error global" role="alert">{error}</p> : null}{notice ? <p className="form-success global" role="status">{notice}</p> : null}

    <section className="model-health" aria-label="وضعیت مدل مالی"><HealthRow label="مدل کانونیکال" description="تبدیل ردیف‌ها و حفظ پیوند با منبع" score={scoreOf(latestCoverage.canonical_model?.score ?? latestCoverage.overall)} ready={latestCoverage.canonical_model?.available} /><HealthRow label="تراز اسناد" description="کنترل برابری بدهکار و بستانکار" score={scoreOf(latestCoverage.journal_balance?.score)} ready={latestCoverage.journal_balance?.available} /><HealthRow label="تحلیل سود و زیان" description={accounts.length ? `${new Intl.NumberFormat("fa-IR").format(accounts.length)} حساب هنوز طبقه‌بندی نشده است` : "همهٔ حساب‌ها برای تحلیل آماده‌اند"} score={accounts.length ? scoreOf(latestCoverage.profit_analysis?.score) : 100} ready={!accounts.length} /></section>

    <section className="normalized-sources" aria-labelledby="normalized-title"><div className="section-title"><div><h3 id="normalized-title">منابع نرمال‌شده</h3><p>هر ردیف مدل مالی به فایل و ردیف اصلی قابل ردیابی است.</p></div><span>{new Intl.NumberFormat("fa-IR").format(normalizedBatches.length)} منبع</span></div>{normalizedBatches.length ? <div className="source-lines">{normalizedBatches.map((batch) => { const coverage = (batch.coverage ?? {}) as Coverage; return <article key={batch.id}><span className="source-kind"><Icon name="file" /></span><div><strong>{batch.original_name}</strong><small>{batch.source_label} · {new Intl.NumberFormat("fa-IR").format(batch.row_count ?? 0)} ردیف</small></div><span className="lineage-state"><Icon name="check" />{coverage.canonical_model?.lineage_complete ? "ردیابی کامل" : "نرمال‌شده"}</span><strong className="source-score">{scoreOf(coverage.canonical_model?.score ?? coverage.overall)}٪</strong></article>; })}</div> : <div className="model-empty"><Icon name="upload" /><div><strong>هنوز منبع نرمال‌شده‌ای وجود ندارد</strong><p>ابتدا یک فایل را بارگذاری، نگاشت و ثبت نهایی کنید.</p></div><Link className="secondary-button" href={`/companies/${company.id}/imports`}>رفتن به ورود داده</Link></div>}</section>

    <section className="classification-queue" aria-labelledby="classification-title"><div className="classification-header"><div><h3 id="classification-title">صف طبقه‌بندی حساب‌ها</h3><p>هر انتخاب با تاریخ اثر و هویت تأییدکننده، به‌صورت تغییرناپذیر ثبت می‌شود.</p></div><div className="queue-progress"><span>{accounts.length ? `${new Intl.NumberFormat("fa-IR").format(accounts.length)} حساب باقی‌مانده` : "طبقه‌بندی کامل"}</span><div><i style={{ width: `${completion}%` }} /></div></div></div>{!canClassify ? <div className="viewer-note"><Icon name="shield" /><span><strong>دسترسی مشاهده‌گر</strong>برای طبقه‌بندی حساب، نقش مدیر مالی یا مشاور لازم است.</span></div> : null}{accounts.length ? <div className="account-table"><div className="account-table-head"><span>کد حساب</span><span>عنوان حساب</span><span>طبقهٔ مالی</span><span>تاریخ اثر</span><span /></div>{accounts.map((account) => <form className="account-row" key={account.id} onSubmit={(event) => void classify(event, account)}><code dir="ltr">{account.source_code}</code><div><strong>{account.name}</strong>{account.normalized_name !== account.name ? <small>{account.normalized_name}</small> : null}</div><label><span className="sr-only">طبقهٔ مالی {account.name}</span><select value={selectedClasses[account.id] ?? ""} onChange={(event) => setSelectedClasses((current) => ({ ...current, [account.id]: event.target.value as AccountClass }))} disabled={!canClassify}><option value="">انتخاب طبقه</option>{Object.entries(classLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span className="sr-only">تاریخ اثر {account.name}</span><input type="date" dir="ltr" value={effectiveDates[account.id] ?? today} onChange={(event) => setEffectiveDates((current) => ({ ...current, [account.id]: event.target.value }))} disabled={!canClassify} /></label><button className="secondary-button" disabled={!canClassify || busyId === account.id || !selectedClasses[account.id]}>{busyId === account.id ? "در حال ثبت…" : "ثبت"}</button></form>)}</div> : <div className="classification-complete"><span><Icon name="check" /></span><div><h4>همهٔ حساب‌ها طبقه‌بندی شدند</h4><p>مدل مالی برای محاسبات و تحلیل‌های فاز بعد آماده است.</p></div></div>}</section>
  </div>;
}

function HealthRow({ label, description, score, ready }: { label: string; description: string; score: number; ready?: boolean }) {
  return <div><span className={`health-state${ready ? " ready" : ""}`}>{ready ? <Icon name="check" /> : <Icon name="alert" />}</span><div><strong>{label}</strong><small>{description}</small></div><div className="health-meter"><i style={{ width: `${score}%` }} /></div><b>{new Intl.NumberFormat("fa-IR").format(score)}٪</b></div>;
}

function FinancialModelSkeleton() {
  return <div className="financial-model-skeleton" aria-label="در حال دریافت مدل مالی"><span /><span /><span /><span /></div>;
}
