"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

  if (loading) return <div className="ai-skeleton" aria-label="در حال دریافت وضعیت دستیار"><span /><div><span /><span /></div><span /></div>;
  if (!settings) return <section className="ai-load-error"><Icon name="alert" /><div><h2>وضعیت دستیار در دسترس نیست</h2><p>{error || "ارتباط با سامانه برقرار نشد."}</p></div></section>;
  const currentBlocker = blocker(settings);
  const readiness = [
    { label: "مجوز سراسری", ready: settings.global_enabled, detail: settings.global_enabled ? "فعال" : "خاموش" },
    { label: "مجوز شرکت", ready: settings.enabled, detail: settings.enabled ? "ثبت‌شده" : "غیرفعال" },
    { label: "ارائه‌دهنده مصوب", ready: settings.provider_configured, detail: settings.provider_configured ? "پیکربندی‌شده" : "تعیین‌نشده" },
    { label: "محل پردازش", ready: settings.data_region_configured, detail: settings.data_region_configured ? "ثبت‌شده" : "تعیین‌نشده" },
  ];

  return <div className="ai-control-center">
    <section className={`ai-intro ${currentBlocker ? "is-locked" : "is-ready"}`}>
      <div><span className="model-kicker"><Icon name="shield" />دستیار با مرز کنترل‌شده</span><h2>AI فقط توضیح می‌دهد؛ تصمیم مالی را تغییر نمی‌دهد</h2><p>محاسبات، تطبیق، اولویت و گزارش‌ها مستقل و قطعی می‌مانند. هر درخواست و نتیجه نیز برای ممیزی ثبت می‌شود.</p></div>
      <div className="ai-master-state"><span><Icon name={currentBlocker ? "shield" : "check"} /></span><div><small>وضعیت مؤثر</small><strong>{currentBlocker ? "ارسال خارجی مسدود" : "آماده استفاده کنترل‌شده"}</strong><p>{currentBlocker ?? "تمام چهار شرط امنیتی برقرار است."}</p></div></div>
    </section>
    {error ? <p className="form-error global" role="alert">{error}</p> : null}

    <section className="ai-readiness" aria-labelledby="ai-readiness-title"><header><div><h3 id="ai-readiness-title">زنجیره اجازه پردازش</h3><p>تا برقرارشدن همه شرط‌ها، هیچ داده مالی به ارائه‌دهنده خارجی ارسال نمی‌شود.</p></div><span>{readiness.filter((item) => item.ready).length.toLocaleString("fa-IR")} از ۴ آماده</span></header><ol>{readiness.map((item, index) => <li key={item.label} className={item.ready ? "ready" : "blocked"}><span>{item.ready ? <Icon name="check" /> : new Intl.NumberFormat("fa-IR", { minimumIntegerDigits: 2 }).format(index + 1)}</span><strong>{item.label}</strong><small>{item.detail}</small></li>)}</ol></section>

    <div className="ai-settings-layout">
      <form className="ai-settings" onSubmit={(event) => void save(event)}><header><div><h3>اختیارات شرکت</h3><p>هر ذخیره یک نسخه تازه می‌سازد و سابقه قبلی حذف نمی‌شود.</p></div><Icon name="tune" /></header><fieldset disabled={!isOwner || saving}><Toggle checked={draft.enabled} onChange={(value) => setDraft((current) => ({ ...current, enabled: value }))} title="فعال‌سازی دستیار برای شرکت" description="مجوز پایه شرکت؛ بدون این گزینه هیچ قابلیت هوشمندی مؤثر نیست." /><Toggle checked={draft.explanations_enabled} onChange={(value) => setDraft((current) => ({ ...current, explanations_enabled: value }))} title="توضیح فارسی یافته‌ها" description="فقط شناسه یافته، کد دلیل، اعداد مجاز و شناسه شواهد ارسال می‌شوند." /><Toggle checked={draft.semantic_matching_enabled} onChange={(value) => setDraft((current) => ({ ...current, semantic_matching_enabled: value }))} title="رتبه‌بندی تطبیق‌های مبهم" description="فقط نامزدهایی بررسی می‌شوند که موتور قطعی از قبل محدود کرده است." /><Button className="primary-button" disabled={!isOwner || saving}>{saving ? <><span className="button-spinner" />در حال ثبت نسخه…</> : <><Icon name="shield" />ثبت نسخه تنظیمات</>}</Button>{saved ? <p className="save-confirmation" role="status"><Icon name="check" />نسخه تازه تنظیمات ثبت شد.</p> : null}</fieldset>{!isOwner ? <footer><Icon name="shield" /><p><strong>فقط مالک شرکت امکان تغییر دارد</strong>وضعیت و تاریخچه برای شما فقط خواندنی است.</p></footer> : null}</form>

      <section className="ai-contract" aria-labelledby="ai-contract-title"><header><h3 id="ai-contract-title">قرارداد غیرقابل عبور</h3><span>Guardrails v1</span></header><ul><li><Icon name="target" /><div><strong>ورودی محدود و ساخت‌یافته</strong><p>فایل خام، متن آزاد حسابداری و کل داده شرکت وارد درخواست نمی‌شود.</p></div></li><li><Icon name="evidence" /><div><strong>عدد و شاهد فقط از فهرست مجاز</strong><p>هر عدد تازه یا شاهد ناشناخته باعث رد کامل خروجی می‌شود.</p></div></li><li><Icon name="users" /><div><strong>بررسی انسانی همیشه اجباری</strong><p>AI نمی‌تواند یافته را تأیید، رد یا حل کند.</p></div></li><li><Icon name="activity" /><div><strong>شکست امن</strong><p>خاموشی یا خطای AI هیچ محاسبه قطعی را متوقف نمی‌کند.</p></div></li></ul><div className="ai-capability-links"><Link href={`/companies/${company.id}/findings`}><span><Icon name="findings" /></span><div><strong>توضیح یافته</strong><small>{settings.explanations_effective ? "آماده" : "فعلاً مسدود"}</small></div><Icon name="chevron" /></Link><Link href={`/companies/${company.id}/reconciliation`}><span><Icon name="reconcile" /></span><div><strong>رتبه‌بندی معنایی</strong><small>{settings.semantic_matching_effective ? "آماده" : "فعلاً مسدود"}</small></div><Icon name="chevron" /></Link></div></section>
    </div>

    <section className="ai-history" aria-labelledby="ai-history-title"><header><div><h3 id="ai-history-title">دفتر درخواست‌های هوشمند</h3><p>موفق، مسدود یا ردشده؛ همه نتیجه‌ها بدون زنجیره فکر نگهداری می‌شوند.</p></div><span>{invocations.length.toLocaleString("fa-IR")} درخواست اخیر</span></header>{invocations.length ? <div className="ai-invocation-list">{invocations.map((item) => <article key={item.id}><span className={`ai-invocation-icon status-${item.status}`}><Icon name={item.status === "succeeded" ? "check" : item.status === "disabled" ? "shield" : "alert"} /></span><div><strong>{purposeLabels[item.purpose]}</strong><small>{faDateTime(item.created_at)} · <code dir="ltr">{item.prompt_version}</code></small></div><span className={`ai-status status-${item.status}`}>{statusLabels[item.status]}</span><div className="ai-invocation-meta"><span>ارائه‌دهنده <b dir="ltr">{item.provider}</b></span><span>زمان پاسخ <b>{item.latency_ms.toLocaleString("fa-IR")} ms</b></span></div>{item.failure_message ? <p>{item.failure_message}</p> : null}</article>)}</div> : <div className="ai-history-empty"><Icon name="shield" /><div><strong>هنوز درخواستی ثبت نشده است</strong><p>از پرونده یک یافته یا نتایج تطبیق، درخواست کنترل‌شده را آغاز کنید.</p></div></div>}</section>
  </div>;
}

function Toggle({ checked, onChange, title, description }: { checked: boolean; onChange: (value: boolean) => void; title: string; description: string }) {
  return <label className="ai-toggle"><span><strong>{title}</strong><small>{description}</small></span><Input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true" /></label>;
}
