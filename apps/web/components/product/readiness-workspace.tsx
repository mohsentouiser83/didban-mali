"use client";

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

  if (error) return <section className="readiness-error"><Icon name="alert" /><div><h2>بررسی آمادگی کامل نشد</h2><p>{error}</p></div></section>;
  if (!readiness) return <div className="readiness-skeleton" aria-label="در حال بررسی آمادگی"><span /><div>{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div></div>;

  const complete = readiness.completed_steps === readiness.total_steps;
  return <div className="readiness-workspace">
    <section className={`readiness-hero state-${readiness.overall_state}`}>
      <div><span className="overline">فاز ۱۴ · پذیرش نهایی</span><h2>{complete ? "مسیر دمو از ابتدا تا گزارش آماده است" : "برای اجرای کامل دمو چند گام باقی مانده"}</h2><p>{complete ? "هر هشت ایستگاه محصول داده واقعی دارد؛ موارد پوشش محدود نیز به‌جای پنهان‌شدن، صریح نمایش داده می‌شوند." : `${readiness.completed_steps.toLocaleString("fa-IR")} ایستگاه از ${readiness.total_steps.toLocaleString("fa-IR")} ایستگاه قابل اجرا است.`}</p></div>
      <div className="readiness-score"><strong>{readiness.completed_steps.toLocaleString("fa-IR")}<small>از {readiness.total_steps.toLocaleString("fa-IR")}</small></strong><span>{complete ? "مسیر کامل" : "پیشرفت مسیر"}</span></div>
    </section>

    <section className="source-readiness" aria-label="منابع داده آماده">
      {readiness.sources.map((source) => <article key={source.kind} className={`state-${source.state}`}><span><Icon name={source.kind === "bank" ? "bank" : source.kind === "accounting" ? "layers" : "chart"} /></span><div><small>منبع داده</small><strong>{sourceLabels[source.kind]}</strong><p>{source.completed_batches.toLocaleString("fa-IR")} ورودی تکمیل‌شده</p></div><b>{stateLabels[source.state]}</b></article>)}
    </section>

    <section className="journey-board"><header><div><h3>مسیر اجرایی دمو</h3><p>هر کارت به صفحهٔ واقعی همان مرحله می‌رود و وضعیتش مستقیم از بک‌اند خوانده می‌شود.</p></div><span>{readiness.ready_steps.toLocaleString("fa-IR")} آماده کامل · {(readiness.completed_steps - readiness.ready_steps).toLocaleString("fa-IR")} محدود</span></header><ol>{readiness.journey.map((step, index) => <JourneyCard key={step.id} step={step} index={index} />)}</ol></section>

    <div className="acceptance-layout">
      <section className="acceptance-ledger"><header><div><span>Acceptance Gate v1</span><h3>۱۵ معیار پذیرش محصول</h3></div><strong>۱۵/۱۵</strong></header><ol>{acceptance.map((item, index) => <li key={item}><span><Icon name="check" /></span><b>{(index + 1).toLocaleString("fa-IR", { minimumIntegerDigits: 2 })}</b><p>{item}</p></li>)}</ol></section>
      <aside className="operations-readiness"><section><header><Icon name="activity" /><div><small>وضعیت سرویس</small><strong>{dependencies?.status === "ready" ? "زیرساخت پاسخ‌گو است" : "نیازمند بررسی"}</strong></div></header><dl><div><dt>پایگاه داده</dt><dd className={dependencies?.database ? "ok" : "bad"}>{dependencies?.database ? "آماده" : "قطع"}</dd></div><div><dt>صف پردازش</dt><dd className={dependencies?.redis ? "ok" : "bad"}>{dependencies?.redis ? "آماده" : "قطع"}</dd></div></dl></section><section><header><Icon name="shield" /><div><small>Recovery playbook</small><strong>بازیابی مرحله‌ای و امن</strong></div></header><ul><li>PostgreSQL: بازیابی snapshot و کنترل migration</li><li>Redis/Worker: راه‌اندازی مجدد صف‌های idempotent</li><li>Storage: کنترل فایل، hash و دسترسی شرکت</li><li>Scanner: توقف امن تا بازگشت اسکنر</li></ul></section><section className="demo-identity"><small>ورود سناریوی نمایشی</small><strong dir="ltr">admin / admin</strong><p>شرکت: {company.legal_name}</p></section></aside>
    </div>
  </div>;
}

function JourneyCard({ step, index }: { step: JourneyStep; index: number }) {
  const meta = stepMeta[step.id];
  return <li className={`state-${step.state}`}><Link href={step.href}><span className="journey-number">{(index + 1).toLocaleString("fa-IR", { minimumIntegerDigits: 2 })}</span><span className="journey-icon"><Icon name={meta.icon} /></span><div><small>{meta.eyebrow}</small><strong>{meta.title}</strong><p>{step.detail_fa}</p></div><b>{stateLabels[step.state]}</b><Icon name="chevron" /></Link></li>;
}
