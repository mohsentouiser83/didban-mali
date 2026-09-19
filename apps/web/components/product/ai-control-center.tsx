"use client";

import { Alert } from "@/components/ui/alert";

import { Badge } from "@/components/ui/badge";

import { ProductCard } from "./product-card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { api } from "@/lib/product-api";
import type { AiInvocation, AiSettings, Company } from "@/lib/product-types";

import { Icon } from "./icons";

const purposeLabels = { finding_explanation: "توضیح یافته", semantic_matching: "رتبه‌بندی تطبیق مبهم" } as const;
const statusLabels = { disabled: "متوقف‌شده ایمن", succeeded: "پاسخ معتبر", failed: "ناموفق", invalid_output: "خروجی ردشده" } as const;

function faDateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value)) : "هنوز تنظیمی ثبت نشده";
}

function blocker(settings: AiSettings) {
  if (!settings.global_enabled) return "کلید سراسری سامانه خاموش است";
  if (!settings.enabled) return "دستیار برای این شرکت فعال نشده است";
  if (!settings.provider_configured) return "ارائه‌دهنده مورد تأیید پیکربندی نشده است";
  if (!settings.data_region_configured) return "محل پردازش داده تعیین نشده است";
  return null;
}

export function AiControlCenter({ company }: { company: Company }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [invocations, setInvocations] = useState<AiInvocation[]>([]);
  const [draft, setDraft] = useState({ enabled: false, explanations_enabled: false, semantic_matching_enabled: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const isOwner = company.role === "owner";

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const [current, history] = await Promise.all([
          api<AiSettings>(`/companies/${company.id}/ai/settings`),
          api<AiInvocation[]>(`/companies/${company.id}/ai/invocations?limit=30`),
        ]);
        if (ignore) return;
        setSettings(current); setDraft({ enabled: current.enabled, explanations_enabled: current.explanations_enabled, semantic_matching_enabled: current.semantic_matching_enabled }); setInvocations(history);
      } catch (caught) { if (!ignore) setError(caught instanceof Error ? caught.message : "وضعیت دستیار دریافت نشد."); }
      finally { if (!ignore) setLoading(false); }
    }
    void load();
    return () => { ignore = true; };
  }, [company.id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setSaved(false); setError("");
    try {
      const current = await api<AiSettings>(`/companies/${company.id}/ai/settings`, { method: "PUT", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(draft) });
      setSettings(current); setDraft({ enabled: current.enabled, explanations_enabled: current.explanations_enabled, semantic_matching_enabled: current.semantic_matching_enabled }); setSaved(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تنظیمات ذخیره نشد."); }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div className="ai-skeleton space-y-4 p-6" aria-label="در حال دریافت وضعیت دستیار">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (!settings) {
    return (
      <section className="ai-load-error flex items-start gap-3 p-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-900">
        <Icon name="alert" />
        <div>
          <h2 className="text-sm font-bold">وضعیت دستیار در دسترس نیست</h2>
          <p className="text-xs mt-1">{error || "ارتباط با سامانه برقرار نشد."}</p>
        </div>
      </section>
    );
  }

  const currentBlocker = blocker(settings);
  const readiness = [
    { label: "مجوز سراسری", ready: settings.global_enabled, detail: settings.global_enabled ? "فعال" : "خاموش" },
    { label: "مجوز شرکت", ready: settings.enabled, detail: settings.enabled ? "ثبت‌شده" : "غیرفعال" },
    { label: "ارائه‌دهنده مصوب", ready: settings.provider_configured, detail: settings.provider_configured ? "پیکربندی‌شده" : "تعیین‌نشده" },
    { label: "محل پردازش", ready: settings.data_region_configured, detail: settings.data_region_configured ? "ثبت‌شده" : "تعیین‌نشده" },
  ];

  return (
    <div className="ai-control-center space-y-6">
      <section className={`ai-intro p-6 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-6 ${
        currentBlocker ? "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/60" : "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/60"
      }`}>
        <div className="space-y-2">
          <span className="model-kicker inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full"><Icon name="shield" />دستیار با مرز کنترل‌شده</span>
          <h2 className="text-xl font-bold text-foreground">AI فقط توضیح می‌دهد؛ تصمیم مالی را تغییر نمی‌دهد</h2>
          <p className="text-xs text-muted-foreground max-w-2xl">محاسبات، تطبیق، اولویت و گزارش‌ها مستقل و قطعی می‌مانند. هر درخواست و نتیجه نیز برای ممیزی ثبت می‌شود.</p>
        </div>
        <div className="ai-master-state flex items-center gap-3.5 p-4 rounded-xl bg-card border border-border/70 shrink-0">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-base ${
            currentBlocker ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
          }`}>
            <Icon name={currentBlocker ? "shield" : "check"} />
          </span>
          <div>
            <small className="block text-[11px] text-muted-foreground">وضعیت مؤثر</small>
            <strong className="block text-sm font-semibold text-foreground">{currentBlocker ? "ارسال خارجی مسدود" : "آماده استفاده کنترل‌شده"}</strong>
            <p className="text-xs text-muted-foreground mt-0.5">{currentBlocker ?? "تمام چهار شرط امنیتی برقرار است."}</p>
          </div>
        </div>
      </section>
      {error ? <Alert className="form-error border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-900" role="alert">{error}</Alert> : null}

      <ProductCard className="ai-readiness p-5 sm:p-6 bg-card border border-border/80 rounded-2xl shadow-sm space-y-4" aria-labelledby="ai-readiness-title">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/70">
          <div>
            <h3 id="ai-readiness-title" className="text-base font-bold text-foreground">زنجیره اجازه پردازش</h3>
            <p className="text-xs text-muted-foreground">تا برقرارشدن همه شرط‌ها، هیچ داده مالی به ارائه‌دهنده خارجی ارسال نمی‌شود.</p>
          </div>
          <span className="text-xs text-muted-foreground font-medium">{readiness.filter((item) => item.ready).length.toLocaleString("fa-IR")} از ۴ آماده</span>
        </header>
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {readiness.map((item, index) => (
            <li key={item.label} className={`flex items-center gap-3 p-3 rounded-xl border text-xs ${
              item.ready ? "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900/60" : "border-border/70 bg-muted/20"
            }`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                item.ready ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400" : "bg-muted text-muted-foreground"
              }`}>
                {item.ready ? <Icon name="check" /> : new Intl.NumberFormat("fa-IR", { minimumIntegerDigits: 2 }).format(index + 1)}
              </span>
              <div>
                <strong className="block font-semibold text-foreground">{item.label}</strong>
                <small className="text-muted-foreground text-[11px]">{item.detail}</small>
              </div>
            </li>
          ))}
        </ol>
      </ProductCard>

      <div className="ai-settings-layout grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form className="ai-settings lg:col-span-6 p-5 sm:p-6 bg-card border border-border/80 rounded-2xl shadow-sm space-y-4" onSubmit={(event) => void save(event)}>
          <header className="flex items-center justify-between pb-3 border-b border-border/70">
            <div>
              <h3 className="text-base font-bold text-foreground">اختیارات شرکت</h3>
              <p className="text-xs text-muted-foreground">هر ذخیره یک نسخه تازه می‌سازد و سابقه قبلی حذف نمی‌شود.</p>
            </div>
            <span className="text-muted-foreground"><Icon name="tune" /></span>
          </header>
          <fieldset disabled={!isOwner || saving} className="space-y-3">
            <Toggle checked={draft.enabled} onChange={(value) => setDraft((current) => ({ ...current, enabled: value }))} title="فعال‌سازی دستیار برای شرکت" description="مجوز پایه شرکت؛ بدون این گزینه هیچ قابلیت هوشمندی مؤثر نیست." />
            <Toggle checked={draft.explanations_enabled} onChange={(value) => setDraft((current) => ({ ...current, explanations_enabled: value }))} title="توضیح فارسی یافته‌ها" description="فقط شناسه یافته، کد دلیل، اعداد مجاز و شناسه شواهد ارسال می‌شوند." />
            <Toggle checked={draft.semantic_matching_enabled} onChange={(value) => setDraft((current) => ({ ...current, semantic_matching_enabled: value }))} title="رتبه‌بندی تطبیق‌های مبهم" description="فقط نامزدهایی بررسی می‌شوند که موتور قطعی از قبل محدود کرده است." />
            <Button className="primary-button w-full" disabled={!isOwner || saving}>
              {saving ? <><span className="loading-ring inline-block mr-2" />در حال ثبت نسخه…</> : <><Icon name="shield" />ثبت نسخه تنظیمات</>}
            </Button>
            {saved ? (
              <p className="save-confirmation flex items-center justify-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium" role="status">
                <Icon name="check" />نسخه تازه تنظیمات ثبت شد.
              </p>
            ) : null}
          </fieldset>
          {!isOwner ? (
            <footer className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/40 border border-border/70 text-xs text-muted-foreground mt-4">
              <Icon name="shield" />
              <div>
                <strong className="block text-foreground font-semibold">فقط مالک شرکت امکان تغییر دارد</strong>
                وضعیت و تاریخچه برای شما فقط خواندنی است.
              </div>
            </footer>
          ) : null}
        </form>

        <ProductCard className="ai-contract lg:col-span-6 p-5 sm:p-6 bg-card border border-border/80 rounded-2xl shadow-sm space-y-4" aria-labelledby="ai-contract-title">
          <header className="flex items-center justify-between pb-3 border-b border-border/70">
            <h3 id="ai-contract-title" className="text-base font-bold text-foreground">قرارداد غیرقابل عبور</h3>
            <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">Guardrails v1</span>
          </header>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <li className="flex items-start gap-2.5 p-3 rounded-xl border border-border/60 bg-muted/20">
              <span className="text-primary mt-0.5"><Icon name="target" /></span>
              <div>
                <strong className="block font-semibold text-foreground">ورودی محدود و ساخت‌یافته</strong>
                <p className="text-muted-foreground mt-0.5">فایل خام، متن آزاد حسابداری و کل داده شرکت وارد درخواست نمی‌شود.</p>
              </div>
            </li>
            <li className="flex items-start gap-2.5 p-3 rounded-xl border border-border/60 bg-muted/20">
              <span className="text-primary mt-0.5"><Icon name="evidence" /></span>
              <div>
                <strong className="block font-semibold text-foreground">عدد و شاهد فقط از فهرست مجاز</strong>
                <p className="text-muted-foreground mt-0.5">هر عدد تازه یا شاهد ناشناخته باعث رد کامل خروجی می‌شود.</p>
              </div>
            </li>
            <li className="flex items-start gap-2.5 p-3 rounded-xl border border-border/60 bg-muted/20">
              <span className="text-primary mt-0.5"><Icon name="users" /></span>
              <div>
                <strong className="block font-semibold text-foreground">بررسی انسانی همیشه اجباری</strong>
                <p className="text-muted-foreground mt-0.5">AI نمی‌تواند یافته را تأیید، رد یا حل کند.</p>
              </div>
            </li>
            <li className="flex items-start gap-2.5 p-3 rounded-xl border border-border/60 bg-muted/20">
              <span className="text-primary mt-0.5"><Icon name="activity" /></span>
              <div>
                <strong className="block font-semibold text-foreground">شکست امن</strong>
                <p className="text-muted-foreground mt-0.5">خاموشی یا خطای AI هیچ محاسبه قطعی را متوقف نمی‌کند.</p>
              </div>
            </li>
          </ul>
          <div className="ai-capability-links grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <Link href={`/companies/${company.id}/findings`} className="flex items-center justify-between p-3 rounded-xl border border-border/70 hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon name="findings" /></span>
                <div>
                  <strong className="block text-xs font-semibold text-foreground">توضیح یافته</strong>
                  <small className="text-[11px] text-muted-foreground">{settings.explanations_effective ? "آماده" : "فعلاً مسدود"}</small>
                </div>
              </div>
              <Icon name="chevron" />
            </Link>
            <Link href={`/companies/${company.id}/reconciliation`} className="flex items-center justify-between p-3 rounded-xl border border-border/70 hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon name="reconcile" /></span>
                <div>
                  <strong className="block text-xs font-semibold text-foreground">رتبه‌بندی معنایی</strong>
                  <small className="text-[11px] text-muted-foreground">{settings.semantic_matching_effective ? "آماده" : "فعلاً مسدود"}</small>
                </div>
              </div>
              <Icon name="chevron" />
            </Link>
          </div>
        </ProductCard>
      </div>

      <ProductCard className="ai-history p-5 sm:p-6 bg-card border border-border/80 rounded-2xl shadow-sm space-y-4" aria-labelledby="ai-history-title">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/70">
          <div>
            <h3 id="ai-history-title" className="text-base font-bold text-foreground">دفتر درخواست‌های هوشمند</h3>
            <p className="text-xs text-muted-foreground">موفق، مسدود یا ردشده؛ همه نتیجه‌ها بدون زنجیره فکر نگهداری می‌شوند.</p>
          </div>
          <span className="text-xs text-muted-foreground font-medium">{invocations.length.toLocaleString("fa-IR")} درخواست اخیر</span>
        </header>
        {invocations.length ? (
          <div className="ai-invocation-list space-y-3">
            {invocations.map((item) => (
              <article key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border/70 bg-card/60 text-xs">
                <div className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${
                    item.status === "succeeded" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400" :
                    item.status === "disabled" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400" :
                    "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                  }`}>
                    <Icon name={item.status === "succeeded" ? "check" : item.status === "disabled" ? "shield" : "alert"} />
                  </span>
                  <div>
                    <strong className="block font-semibold text-foreground">{purposeLabels[item.purpose]}</strong>
                    <small className="text-[11px] text-muted-foreground">{faDateTime(item.created_at)} · <code dir="ltr" className="font-mono">{item.prompt_version}</code></small>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge className={`text-[11px] font-medium border ${
                    item.status === "succeeded" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60" :
                    item.status === "disabled" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60" :
                    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60"
                  }`}>
                    {statusLabels[item.status]}
                  </Badge>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-3">
                    <span>ارائه‌دهنده <b dir="ltr" className="font-semibold text-foreground">{item.provider}</b></span>
                    <span>زمان پاسخ <b className="font-semibold text-foreground">{item.latency_ms.toLocaleString("fa-IR")} ms</b></span>
                  </div>
                </div>
                {item.failure_message ? <p className="text-xs text-rose-600 dark:text-rose-400 w-full pt-1 border-t border-border/40">{item.failure_message}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="ai-history-empty flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed border-border/70 text-xs text-muted-foreground gap-2">
            <span className="text-muted-foreground/60 text-lg"><Icon name="shield" /></span>
            <strong className="text-foreground font-semibold">هنوز درخواستی ثبت نشده است</strong>
            <p>از پرونده یک یافته یا نتایج تطبیق، درخواست کنترل‌شده را آغاز کنید.</p>
          </div>
        )}
      </ProductCard>
    </div>
  );
}

function Toggle({ checked, onChange, title, description }: { checked: boolean; onChange: (value: boolean) => void; title: string; description: string }) {
  return (
    <label className="ai-toggle flex items-center justify-between gap-4 p-3.5 rounded-xl border border-border/70 hover:bg-muted/30 transition-colors cursor-pointer">
      <span className="space-y-0.5">
        <strong className="block text-xs font-semibold text-foreground">{title}</strong>
        <small className="block text-[11px] text-muted-foreground">{description}</small>
      </span>
      <div className="relative inline-flex items-center shrink-0">
        <Input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
      </div>
    </label>
  );
}
