"use client";

import { Button } from "@/components/ui/button";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/product-api";
import type { AiFindingExplanation, AiInvocation, AiSettings, Company } from "@/lib/product-types";

import { Icon } from "./icons";

function isExplanation(output: AiInvocation["output"]): output is AiFindingExplanation {
  return output !== null && "summary_fa" in output;
}

export function AiFindingExplanationPanel({ company, findingId }: { company: Company; findingId: string }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [invocation, setInvocation] = useState<AiInvocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canRequest = company.role !== "viewer";

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const [currentSettings, history] = await Promise.all([
          api<AiSettings>(`/companies/${company.id}/ai/settings`),
          api<AiInvocation[]>(`/companies/${company.id}/ai/invocations?purpose=finding_explanation&source_finding_id=${findingId}&limit=1`),
        ]);
        if (!ignore) { setSettings(currentSettings); setInvocation(history[0] ?? null); }
      } catch (caught) { if (!ignore) setError(caught instanceof Error ? caught.message : "وضعیت توضیح هوشمند دریافت نشد."); }
      finally { if (!ignore) setLoading(false); }
    }
    void load();
    return () => { ignore = true; };
  }, [company.id, findingId]);

  async function requestExplanation() {
    setBusy(true); setError("");
    try {
      const created = await api<AiInvocation>(`/companies/${company.id}/ai/findings/${findingId}/explanations`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } });
      setInvocation(created);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "درخواست توضیح ثبت نشد."); }
    finally { setBusy(false); }
  }

  if (loading) return <section className="ai-finding-panel is-loading" aria-label="در حال دریافت توضیح هوشمند"><span /><span /></section>;
  const explanation = invocation && isExplanation(invocation.output) ? invocation.output : null;
  const effective = settings?.explanations_effective ?? false;
  return <section className={`ai-finding-panel ${effective ? "is-ready" : "is-locked"}`} aria-labelledby="ai-finding-title">
    <header><div><span><Icon name="shield" />لایه توضیح کنترل‌شده</span><h3 id="ai-finding-title">این یافته به زبان ساده</h3><p>توضیح احتمالی فقط بر پایه اعداد و شواهد همین پرونده ساخته می‌شود.</p></div><span className={`ai-status ${effective ? "status-succeeded" : "status-disabled"}`}>{effective ? "آماده" : "ارسال مسدود"}</span></header>
    {error ? <p className="form-error global" role="alert">{error}</p> : null}
    {explanation ? <div className="ai-explanation-output"><div><span>جمع‌بندی</span><p>{explanation.summary_fa}</p></div><div><span>چرا مهم است؟</span><p>{explanation.why_it_matters_fa}</p></div>{explanation.caveats_fa.length ? <div><span>ملاحظات</span><ul>{explanation.caveats_fa.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}<footer><span><Icon name="evidence" />{explanation.referenced_evidence_ids.length.toLocaleString("fa-IR")} شاهد ارجاع‌شده</span><strong><Icon name="users" />نیازمند بررسی انسانی</strong></footer></div> : invocation ? <div className={`ai-safe-stop status-${invocation.status}`}><Icon name={invocation.status === "disabled" ? "shield" : "alert"} /><div><strong>{invocation.status === "disabled" ? "درخواست بدون خروج داده متوقف شد" : "پاسخ قابل استفاده تولید نشد"}</strong><p>{invocation.failure_message ?? "گاردریل‌ها اجازه نمایش این خروجی را ندادند؛ تحلیل قطعی پرونده بدون تغییر باقی مانده است."}</p><small><code dir="ltr">{invocation.failure_code ?? invocation.status}</code> · {invocation.prompt_version}</small></div></div> : <div className="ai-explanation-empty"><div className="ai-input-boundary"><span><Icon name="target" />ورودی این درخواست</span><ul><li>شناسه و کد دلیل یافته</li><li>اعداد مجاز محاسبات</li><li>شناسه شواهد موجود</li></ul></div><div><strong>{effective ? "توضیحی برای این پرونده ثبت نشده است" : "شرایط امنیتی هنوز کامل نیست"}</strong><p>{effective ? "درخواست را ثبت کنید تا پاسخ پس از اعتبارسنجی نمایش داده شود." : "درخواست قابل ثبت و ممیزی است، اما پیش از ارسال خارجی به‌صورت ایمن متوقف می‌شود."}</p></div></div>}
    <footer><Button className="secondary-button" onClick={() => void requestExplanation()} disabled={!canRequest || busy}>{busy ? <><span className="button-spinner" />در حال کنترل درخواست…</> : <><Icon name="activity" />{invocation ? "ثبت درخواست تازه" : "درخواست توضیح کنترل‌شده"}</>}</Button><Link href={`/companies/${company.id}/assistant`}>مشاهده تنظیمات و دفتر ممیزی <Icon name="chevron" /></Link>{!canRequest ? <small>نقش مشاهده‌گر امکان ثبت درخواست ندارد.</small> : null}</footer>
  </section>;
}
