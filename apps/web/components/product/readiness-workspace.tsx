"use client";

import { ProductCard } from "./product-card";
import { Skeleton } from "@/components/ui/skeleton";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/product-api";
import type { Company, CompanyReadiness, DependencyStatus, JourneyStep, ReadinessState } from "@/lib/product-types";

import { Icon, type ProductIconName } from "./icons";

const stepMeta: Record<string, { title: string; eyebrow: string; icon: ProductIconName }> = {
  data: { title: "ورود و تبار داده", eyebrow: "حسابداری · بانک · فروش", icon: "upload" },
  analysis: { title: "محاسبات مالی", eyebrow: "دوره و پوشش صریح", icon: "chart" },
  reconciliation: { title: "تطبیق چندسطحی", eyebrow: "قطعی · قاعده · فازی", icon: "reconcile" },
  findings: { title: "یافته و شاهد", eyebrow: "قابل ردیابی تا فایل", icon: "evidence" },
  review: { title: "بررسی انسانی", eyebrow: "تصمیم و یادداشت", icon: "users" },
  dashboard: { title: "داشبورد مدیریتی", eyebrow: "تصویر وضعیت و اولویت", icon: "home" },
  report: { title: "گزارش پایدار", eyebrow: "Snapshot و PDF", icon: "file" },
  ai: { title: "هوشمندی کنترل‌شده", eyebrow: "اختیاری و شکست‌امن", icon: "shield" },
};

const acceptance = [
  "تفکیک شرکت‌ها و اعمال RBAC",
  "ورود سه منبع با نگاشت و تبار داده",
  "تفکیک خطای مسدودکننده از پوشش محدود",
  "واحد پول و تقویم کاملاً صریح",
  "صحت معیارهای سناریوی نمونه",
  "کاتالوگ دقیق هشت نوع یافته",
  "تفکیک تطبیق قطعی، فازی و هوشمند",
  "ردیابی شاهد تا سطر و فایل منبع",
  "امتیاز و اجزای اولویت قابل توضیح",
  "ثبت تصمیم، یادداشت، عامل و زمان",
  "نمایش وضعیت، اولویت و یافته‌های کم‌اهمیت",
  "گزارش کامل بر پایه Snapshot",
  "اجرای تکرارپذیر و اثرانگشت پایدار",
  "عبور مسیر کامل مرورگر بدون خطای بحرانی",
  "کنترل نشت، آپلود امن، ممیزی و اسرار",
];

const stateLabels: Record<ReadinessState, string> = { ready: "آماده", limited: "آماده با پوشش محدود", missing: "نیازمند اقدام" };
const sourceLabels = { accounting: "حسابداری", bank: "بانک", sales: "فروش" };

export function ReadinessWorkspace({ company }: { company: Company }) {
  const [readiness, setReadiness] = useState<CompanyReadiness | null>(null);
  const [dependencies, setDependencies] = useState<DependencyStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api<CompanyReadiness>(`/companies/${company.id}/readiness`), api<DependencyStatus>("/health/ready")])
      .then(([nextReadiness, nextDependencies]) => { if (active) { setReadiness(nextReadiness); setDependencies(nextDependencies); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "وضعیت آمادگی دریافت نشد."); });
    return () => { active = false; };
  }, [company.id]);

  if (error) {
    return (
      <section className="flex items-start gap-3 p-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-900">
        <Icon name="alert" />
        <div>
          <h2 className="text-sm font-bold">بررسی آمادگی کامل نشد</h2>
          <p className="text-xs mt-1">{error}</p>
        </div>
      </section>
    );
  }

  if (!readiness) {
    return (
      <div className="space-y-4 p-6" aria-label="در حال بررسی آمادگی">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const complete = readiness.completed_steps === readiness.total_steps;
  return (
    <div className="readiness-workspace space-y-6">
      <section className={`readiness-hero p-6 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-6 ${
        readiness.overall_state === "ready" ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/60" :
        readiness.overall_state === "limited" ? "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/60" :
        "border-border/80 bg-card"
      }`}>
        <div className="space-y-2">
          <span className="inline-block text-xs font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">فاز ۱۴ · پذیرش نهایی</span>
          <h2 className="text-xl font-bold text-foreground">{complete ? "مسیر دمو از ابتدا تا گزارش آماده است" : "برای اجرای کامل دمو چند گام باقی مانده"}</h2>
          <p className="text-xs text-muted-foreground max-w-2xl">{complete ? "هر هشت ایستگاه محصول داده واقعی دارد؛ موارد پوشش محدود نیز به‌جای پنهان‌شدن، صریح نمایش داده می‌شوند." : `${readiness.completed_steps.toLocaleString("fa-IR")} ایستگاه از ${readiness.total_steps.toLocaleString("fa-IR")} ایستگاه قابل اجرا است.`}</p>
        </div>
        <div className="readiness-score flex items-center gap-3 p-4 rounded-xl bg-card border border-border/70 shrink-0">
          <strong className="text-2xl font-black text-foreground">
            {readiness.completed_steps.toLocaleString("fa-IR")}
            <small className="text-xs font-normal text-muted-foreground mr-1">از {readiness.total_steps.toLocaleString("fa-IR")}</small>
          </strong>
          <span className="text-xs font-medium text-muted-foreground border-r border-border/70 pr-3 mr-1">{complete ? "مسیر کامل" : "پیشرفت مسیر"}</span>
        </div>
      </section>

      <ProductCard className="source-readiness p-5 bg-card border border-border/80 rounded-2xl shadow-sm" aria-label="منابع داده آماده">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {readiness.sources.map((source) => (
            <article key={source.kind} className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-card/60">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon name={source.kind === "bank" ? "bank" : source.kind === "accounting" ? "layers" : "chart"} />
                </span>
                <div>
                  <small className="block text-[11px] text-muted-foreground">منبع داده</small>
                  <strong className="block text-sm font-semibold text-foreground">{sourceLabels[source.kind]}</strong>
                  <p className="text-xs text-muted-foreground">{source.completed_batches.toLocaleString("fa-IR")} ورودی تکمیل‌شده</p>
                </div>
              </div>
              <b className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${
                source.state === "ready" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60" :
                source.state === "limited" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60" :
                "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60"
              }`}>{stateLabels[source.state]}</b>
            </article>
          ))}
        </div>
      </ProductCard>

      <ProductCard className="journey-board p-5 sm:p-6 bg-card border border-border/80 rounded-2xl shadow-sm space-y-4">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border/70">
          <div>
            <h3 className="text-base font-bold text-foreground">مسیر اجرایی دمو</h3>
            <p className="text-xs text-muted-foreground">هر کارت به صفحهٔ واقعی همان مرحله می‌رود و وضعیتش مستقیم از بک‌اند خوانده می‌شود.</p>
          </div>
          <span className="text-xs text-muted-foreground font-medium">{readiness.ready_steps.toLocaleString("fa-IR")} آماده کامل · {(readiness.completed_steps - readiness.ready_steps).toLocaleString("fa-IR")} محدود</span>
        </header>
        <ol className="space-y-3">
          {readiness.journey.map((step, index) => <JourneyCard key={step.id} step={step} index={index} />)}
        </ol>
      </ProductCard>

      <div className="acceptance-layout grid grid-cols-1 lg:grid-cols-12 gap-6">
        <ProductCard className="acceptance-ledger lg:col-span-7 p-5 sm:p-6 bg-card border border-border/80 rounded-2xl shadow-sm space-y-4">
          <header className="flex items-center justify-between pb-3 border-b border-border/70">
            <div>
              <span className="text-xs font-semibold text-primary">Acceptance Gate v1</span>
              <h3 className="text-base font-bold text-foreground">۱۵ معیار پذیرش محصول</h3>
            </div>
            <strong className="text-sm font-bold bg-primary/10 text-primary px-3 py-1 rounded-full">۱۵/۱۵</strong>
          </header>
          <ol className="grid grid-cols-1 gap-2">
            {acceptance.map((item, index) => (
              <li key={item} className="flex items-start gap-3 p-2.5 rounded-lg border border-border/50 bg-muted/20 text-xs">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 mt-0.5">
                  <Icon name="check" />
                </span>
                <b className="font-mono text-muted-foreground text-[11px] mt-0.5">{(index + 1).toLocaleString("fa-IR", { minimumIntegerDigits: 2 })}</b>
                <p className="text-foreground/90">{item}</p>
              </li>
            ))}
          </ol>
        </ProductCard>

        <aside className="operations-readiness lg:col-span-5 space-y-4">
          <section className="p-5 rounded-2xl border border-border/80 bg-card space-y-4">
            <header className="flex items-center gap-3 pb-3 border-b border-border/70">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name="activity" />
              </span>
              <div>
                <small className="block text-[11px] text-muted-foreground">وضعیت سرویس</small>
                <strong className="text-sm font-semibold text-foreground">{dependencies?.status === "ready" ? "زیرساخت پاسخ‌گو است" : "نیازمند بررسی"}</strong>
              </div>
            </header>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl border border-border/60 bg-muted/20 flex flex-col gap-1">
                <dt className="text-muted-foreground">پایگاه داده</dt>
                <dd className={`font-semibold ${dependencies?.database ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{dependencies?.database ? "آماده" : "قطع"}</dd>
              </div>
              <div className="p-3 rounded-xl border border-border/60 bg-muted/20 flex flex-col gap-1">
                <dt className="text-muted-foreground">صف پردازش</dt>
                <dd className={`font-semibold ${dependencies?.redis ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{dependencies?.redis ? "آماده" : "قطع"}</dd>
              </div>
            </dl>
          </section>

          <section className="p-5 rounded-2xl border border-border/80 bg-card space-y-3">
            <header className="flex items-center gap-3 pb-2 border-b border-border/70">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name="shield" />
              </span>
              <div>
                <small className="block text-[11px] text-muted-foreground">Recovery playbook</small>
                <strong className="text-sm font-semibold text-foreground">بازیابی مرحله‌ای و امن</strong>
              </div>
            </header>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
              <li>PostgreSQL: بازیابی snapshot و کنترل migration</li>
              <li>Redis/Worker: راه‌اندازی مجدد صف‌های idempotent</li>
              <li>Storage: کنترل فایل، hash و دسترسی شرکت</li>
              <li>Scanner: توقف امن تا بازگشت اسکنر</li>
            </ul>
          </section>

          <ProductCard className="demo-identity p-5 rounded-2xl border border-border/80 bg-card space-y-1">
            <small className="block text-[11px] text-muted-foreground">ورود سناریوی نمایشی</small>
            <strong dir="ltr" className="block font-mono text-sm text-foreground">admin / admin</strong>
            <p className="text-xs text-muted-foreground mt-1">شرکت: {company.legal_name}</p>
          </ProductCard>
        </aside>
      </div>
    </div>
  );
}

function JourneyCard({ step, index }: { step: JourneyStep; index: number }) {
  const meta = stepMeta[step.id];
  return (
    <li className="rounded-xl border border-border/70 bg-card hover:border-primary/50 transition-colors">
      <Link href={step.href} className="flex items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3.5">
          <span className="journey-number flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
            {(index + 1).toLocaleString("fa-IR", { minimumIntegerDigits: 2 })}
          </span>
          <span className="journey-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary text-base">
            <Icon name={meta.icon} />
          </span>
          <div>
            <small className="block text-[11px] font-medium text-muted-foreground">{meta.eyebrow}</small>
            <strong className="block text-sm font-semibold text-foreground">{meta.title}</strong>
            <p className="text-xs text-muted-foreground mt-0.5">{step.detail_fa}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
            step.state === "ready" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60" :
            step.state === "limited" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60" :
            "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60"
          }`}>
            {stateLabels[step.state]}
          </span>
          <span className="text-muted-foreground text-xs"><Icon name="chevron" /></span>
        </div>
      </Link>
    </li>
  );
}
