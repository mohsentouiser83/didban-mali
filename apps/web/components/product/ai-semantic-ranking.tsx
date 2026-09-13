"use client";

import { Button } from "@/components/ui/button";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/product-api";
import type { AiInvocation, AiSemanticMatching, AiSettings, Company, ReconciliationMatch } from "@/lib/product-types";

import { Icon } from "./icons";

function isRanking(output: AiInvocation["output"]): output is AiSemanticMatching {
  return output !== null && "ranked_candidates" in output;
}

export function AiSemanticRanking({ company, runId, candidates }: { company: Company; runId: string; candidates: ReconciliationMatch[] }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [invocation, setInvocation] = useState<AiInvocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const candidateIds = candidates.slice(0, 20).map((item) => item.id);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const [current, history] = await Promise.all([
          api<AiSettings>(`/companies/${company.id}/ai/settings`),
          api<AiInvocation[]>(`/companies/${company.id}/ai/invocations?purpose=semantic_matching&source_reconciliation_run_id=${runId}&limit=1`),
        ]);
        if (!ignore) { setSettings(current); setInvocation(history[0] ?? null); }
      } catch (caught) { if (!ignore) setError(caught instanceof Error ? caught.message : "وضعیت رتبه‌بندی دریافت نشد."); }
    }
    void load();
    return () => { ignore = true; };
  }, [company.id, runId]);

  async function rank() {
    if (!candidateIds.length) return;
    setBusy(true); setError("");
    try {
      const created = await api<AiInvocation>(`/companies/${company.id}/ai/reconciliation-runs/${runId}/semantic-candidates`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ candidate_ids: candidateIds }) });
      setInvocation(created);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "درخواست رتبه‌بندی ثبت نشد."); }
    finally { setBusy(false); }
  }

  const ranking = invocation && isRanking(invocation.output) ? invocation.output : null;
  const effective = settings?.semantic_matching_effective ?? false;
  return <section className="ai-semantic-panel" aria-labelledby="semantic-panel-title"><header><div><span><Icon name="shield" />لایه کمکی، نه موتور تصمیم</span><h3 id="semantic-panel-title">رتبه‌بندی معنایی نامزدهای مبهم</h3><p>AI فقط ترتیب همین نامزدهای ازپیش‌محدودشده را پیشنهاد می‌دهد و حق ساخت جفت تازه ندارد.</p></div><span className={`ai-status ${effective ? "status-succeeded" : "status-disabled"}`}>{effective ? "آماده" : "ارسال مسدود"}</span></header>{error ? <p className="form-error global" role="alert">{error}</p> : null}{candidateIds.length ? <div className="semantic-candidate-boundary"><span><strong>{candidateIds.length.toLocaleString("fa-IR")}</strong><small>نامزد مجاز</small></span><p>فقط موارد دارای وضعیت «نیازمند بررسی» وارد درخواست می‌شوند؛ نتیجه همچنان به تأیید انسان نیاز دارد.</p><Button className="secondary-button" onClick={() => void rank()} disabled={company.role === "viewer" || busy}>{busy ? "در حال کنترل…" : invocation ? "ثبت رتبه‌بندی تازه" : "رتبه‌بندی کنترل‌شده"}</Button></div> : <div className="semantic-empty"><Icon name="check" /><div><strong>نامزد مبهمی برای این اجرا وجود ندارد</strong><p>تطبیق قطعی به AI نیاز ندارد؛ فقط نتایج potential_match واجد ورود هستند.</p></div></div>}{ranking ? <ol className="semantic-ranking-list">{ranking.ranked_candidates.map((item, index) => <li key={item.candidate_id}><span>{(index + 1).toLocaleString("fa-IR")}</span><div><strong>{item.reason_fa}</strong><small><code dir="ltr">{item.candidate_id}</code></small></div><b>{(Number(item.confidence) * 100).toLocaleString("fa-IR", { maximumFractionDigits: 0 })}٪</b></li>)}</ol> : invocation ? <div className="ai-safe-stop"><Icon name={invocation.status === "disabled" ? "shield" : "alert"} /><div><strong>{invocation.status === "disabled" ? "درخواست پیش از ارسال متوقف شد" : "خروجی رتبه‌بندی پذیرفته نشد"}</strong><p>{invocation.failure_message}</p><small><code dir="ltr">{invocation.failure_code}</code></small></div></div> : null}<footer><Icon name="users" /><span>هر پیشنهاد نیازمند بررسی انسانی است.</span><Link href={`/companies/${company.id}/assistant`}>تنظیمات و ممیزی <Icon name="chevron" /></Link></footer></section>;
}
