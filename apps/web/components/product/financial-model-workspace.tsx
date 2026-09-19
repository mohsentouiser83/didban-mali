"use client";

import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "./product-card";
import { SelectField, SelectOption } from "./select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { api } from "@/lib/product-api";
import type { AccountClass, AccountClassification, Company, FinancialAccount, ImportBatch } from "@/lib/product-types";

import { Icon } from "./icons";

const classLabels: Record<AccountClass, string> = {
  asset: "دارایی",
  liability: "بدهی",
  equity: "حقوق مالکانه",
  revenue: "درآمد",
  expense: "هزینه",
  other: "سایر",
};

const today = new Date().toISOString().slice(0, 10);

type CoverageSection = {
  score?: number;
  available?: boolean;
  reasons?: string[];
  normalized_rows?: number;
  expected_rows?: number;
  lineage_complete?: boolean;
};

type Coverage = {
  overall?: number;
  canonical_model?: CoverageSection;
  journal_balance?: CoverageSection;
  profit_analysis?: CoverageSection;
};

function scoreOf(value: unknown) {
  return typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
}

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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "مدل مالی دریافت نشد.");
    } finally {
      setLoading(false);
    }
  }, [company.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const latestCoverage = (normalizedBatches[0]?.coverage ?? {}) as Coverage;
  const classifiedCount = Math.max(0, initialCount - accounts.length);
  const completion = initialCount ? Math.round((classifiedCount / initialCount) * 100) : 100;
  const canClassify = company.role !== "viewer";

  async function classify(event: FormEvent<HTMLFormElement>, account: FinancialAccount) {
    event.preventDefault();
    const accountClass = selectedClasses[account.id];
    if (!accountClass) {
      setError("برای ثبت، طبقهٔ حساب را انتخاب کنید.");
      return;
    }
    setBusyId(account.id);
    setError("");
    setNotice("");
    try {
      await api<AccountClassification>(`/companies/${company.id}/accounts/${account.id}/classification`, {
        method: "PUT",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          account_class: accountClass,
          effective_from: effectiveDates[account.id] ?? today,
          rule_version: "human-v1",
        }),
      });
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      setNotice(`حساب «${account.name}» در طبقهٔ ${classLabels[accountClass]} ثبت شد.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "طبقه‌بندی حساب ثبت نشد.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <FinancialModelSkeleton />;

  return (
    <div className="financial-model-workspace space-y-6">
      <section className="model-intro flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <span className="model-kicker inline-flex items-center gap-1.5 text-xs font-bold text-primary mb-1">
            <Icon name="layers" className="size-3.5" />
            مدل مالی کانونیکال
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
            دادهٔ خام به ساختار قابل تحلیل تبدیل شده است
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            پوشش نرمال‌سازی و تراز اسناد را ببینید؛ سپس حساب‌های باقی‌مانده را برای محاسبات سود و زیان طبقه‌بندی کنید.
          </p>
        </div>

        <div className="model-readiness flex items-center gap-3 p-3 rounded-xl border border-border/80 bg-card self-start sm:self-auto shrink-0">
          <div className="text-start">
            <span className="block text-[11px] text-muted-foreground">آمادگی تحلیل</span>
            <strong className="block text-base font-extrabold text-foreground font-mono">
              {scoreOf(latestCoverage.profit_analysis?.score)}٪
            </strong>
          </div>
          <Progress className="readiness-track w-16 h-2" value={scoreOf(latestCoverage.profit_analysis?.score)} />
        </div>
      </section>

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

      {/* Model Health */}
      <ProductCard className="model-health p-6 rounded-2xl border border-border bg-card space-y-4" aria-label="وضعیت مدل مالی">
        <HealthRow
          label="مدل کانونیکال"
          description="تبدیل ردیف‌ها و حفظ پیوند با منبع"
          score={scoreOf(latestCoverage.canonical_model?.score ?? latestCoverage.overall)}
          ready={latestCoverage.canonical_model?.available}
        />
        <HealthRow
          label="تراز اسناد"
          description="کنترل برابری بدهکار و بستانکار"
          score={scoreOf(latestCoverage.journal_balance?.score)}
          ready={latestCoverage.journal_balance?.available}
        />
        <HealthRow
          label="تحلیل سود و زیان"
          description={
            accounts.length
              ? `${new Intl.NumberFormat("fa-IR").format(accounts.length)} حساب هنوز طبقه‌بندی نشده است`
              : "همهٔ حساب‌ها برای تحلیل آماده‌اند"
          }
          score={accounts.length ? scoreOf(latestCoverage.profit_analysis?.score) : 100}
          ready={!accounts.length}
        />
      </ProductCard>

      {/* Normalized Sources */}
      <ProductCard className="normalized-sources p-6 rounded-2xl border border-border bg-card space-y-4" aria-labelledby="normalized-title">
        <div className="section-title flex items-center justify-between border-b border-border/60 pb-3">
          <div>
            <h3 id="normalized-title" className="text-base font-bold text-foreground">منابع نرمال‌شده</h3>
            <p className="text-xs text-muted-foreground">هر ردیف مدل مالی به فایل و ردیف اصلی قابل ردیابی است.</p>
          </div>
          <span className="text-xs font-mono text-muted-foreground font-bold">
            {new Intl.NumberFormat("fa-IR").format(normalizedBatches.length)} منبع
          </span>
        </div>

        {normalizedBatches.length ? (
          <div className="source-lines divide-y divide-border/60">
            {normalizedBatches.map((batch) => {
              const coverage = (batch.coverage ?? {}) as Coverage;
              return (
                <article key={batch.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="source-kind size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Icon name="file" className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <strong className="block text-xs font-bold text-foreground truncate">{batch.original_name}</strong>
                      <small className="block text-[11px] text-muted-foreground truncate">
                        {batch.source_label} · {new Intl.NumberFormat("fa-IR").format(batch.row_count ?? 0)} ردیف
                      </small>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="lineage-state inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <Icon name="check" className="size-3.5" />
                      {coverage.canonical_model?.lineage_complete ? "ردیابی کامل" : "نرمال‌شده"}
                    </span>
                    <strong className="source-score text-xs font-mono font-bold text-foreground">
                      {scoreOf(coverage.canonical_model?.score ?? coverage.overall)}٪
                    </strong>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="model-empty py-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <Icon name="upload" className="size-6 text-muted-foreground/60" />
            <div>
              <strong className="block font-bold text-foreground">هنوز منبع نرمال‌شده‌ای وجود ندارد</strong>
              <p className="mt-1">ابتدا یک فایل را بارگذاری، نگاشت و ثبت نهایی کنید.</p>
            </div>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href={`/companies/${company.id}/imports`}>رفتن به ورود داده</Link>
            </Button>
          </div>
        )}
      </ProductCard>

      {/* Classification Queue */}
      <ProductCard className="classification-queue p-6 rounded-2xl border border-border bg-card space-y-4" aria-labelledby="classification-title">
        <div className="classification-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <h3 id="classification-title" className="text-base font-bold text-foreground">صف طبقه‌بندی حساب‌ها</h3>
            <p className="text-xs text-muted-foreground">هر انتخاب با تاریخ اثر و هویت تأییدکننده، به‌صورت تغییرناپذیر ثبت می‌شود.</p>
          </div>
          <div className="queue-progress flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground">
              {accounts.length ? `${new Intl.NumberFormat("fa-IR").format(accounts.length)} حساب باقی‌مانده` : "طبقه‌بندی کامل"}
            </span>
            <Progress className="w-20 h-2" value={completion} />
          </div>
        </div>

        {!canClassify && (
          <div className="viewer-note flex items-center gap-2 p-3 rounded-xl bg-muted text-xs text-muted-foreground">
            <Icon name="shield" className="size-4 text-primary shrink-0" />
            <span>
              <strong className="font-bold text-foreground">دسترسی مشاهده‌گر: </strong>
              برای طبقه‌بندی حساب، نقش مدیر مالی یا مشاور لازم است.
            </span>
          </div>
        )}

        {accounts.length ? (
          <div className="account-table space-y-2">
            <div className="account-table-head hidden sm:grid grid-cols-[100px_1fr_160px_140px_70px] gap-3 px-3 py-2 text-[11px] font-bold text-muted-foreground border-b border-border/60">
              <span>کد حساب</span>
              <span>عنوان حساب</span>
              <span>طبقهٔ مالی</span>
              <span>تاریخ اثر</span>
              <span />
            </div>

            <div className="space-y-2">
              {accounts.map((account) => (
                <form
                  className="account-row grid grid-cols-1 sm:grid-cols-[100px_1fr_160px_140px_70px] items-center gap-3 p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
                  key={account.id}
                  onSubmit={(event) => void classify(event, account)}
                >
                  <code dir="ltr" className="font-mono text-xs text-foreground/80">
                    {account.source_code}
                  </code>

                  <div className="min-w-0">
                    <strong className="block text-xs font-bold text-foreground truncate">{account.name}</strong>
                    {account.normalized_name !== account.name && (
                      <small className="block text-[11px] text-muted-foreground truncate">{account.normalized_name}</small>
                    )}
                  </div>

                  <label className="block">
                    <span className="sr-only">طبقهٔ مالی {account.name}</span>
                    <SelectField
                      value={selectedClasses[account.id] ?? ""}
                      onChange={(event) =>
                        setSelectedClasses((current) => ({
                          ...current,
                          [account.id]: event.target.value as AccountClass,
                        }))
                      }
                      disabled={!canClassify}
                      className="h-9 text-xs"
                    >
                      <SelectOption value="">انتخاب طبقه</SelectOption>
                      {Object.entries(classLabels).map(([value, label]) => (
                        <SelectOption key={value} value={value}>
                          {label}
                        </SelectOption>
                      ))}
                    </SelectField>
                  </label>

                  <label className="block">
                    <span className="sr-only">تاریخ اثر {account.name}</span>
                    <Input
                      type="date"
                      dir="ltr"
                      value={effectiveDates[account.id] ?? today}
                      onChange={(event) =>
                        setEffectiveDates((current) => ({ ...current, [account.id]: event.target.value }))
                      }
                      disabled={!canClassify}
                      className="h-9 text-xs bg-background text-end"
                    />
                  </label>

                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    className="h-9 text-xs font-bold cursor-pointer"
                    disabled={!canClassify || busyId === account.id || !selectedClasses[account.id]}
                  >
                    {busyId === account.id ? "…" : "ثبت"}
                  </Button>
                </form>
              ))}
            </div>
          </div>
        ) : (
          <div className="classification-complete py-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <span className="size-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Icon name="check" className="size-5" />
            </span>
            <div>
              <h4 className="font-bold text-foreground text-sm">همهٔ حساب‌ها طبقه‌بندی شدند</h4>
              <p className="mt-0.5">مدل مالی برای محاسبات و تحلیل‌های فاز بعد آماده است.</p>
            </div>
          </div>
        )}
      </ProductCard>
    </div>
  );
}

function HealthRow({
  label,
  description,
  score,
  ready,
}: {
  label: string;
  description: string;
  score: number;
  ready?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-border/60 bg-muted/20">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`size-8 rounded-xl flex items-center justify-center shrink-0 ${
            ready
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          }`}
        >
          <Icon name={ready ? "check" : "alert"} className="size-4" />
        </span>
        <div className="min-w-0">
          <strong className="block text-xs font-bold text-foreground">{label}</strong>
          <small className="block text-[11px] text-muted-foreground truncate">{description}</small>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Progress className="w-24 h-2" value={score} />
        <b className="font-mono text-xs text-foreground min-w-[36px] text-end">
          {new Intl.NumberFormat("fa-IR").format(score)}٪
        </b>
      </div>
    </div>
  );
}

function FinancialModelSkeleton() {
  return (
    <div className="financial-model-skeleton space-y-4" aria-label="در حال دریافت مدل مالی">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-60 w-full rounded-2xl" />
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}
