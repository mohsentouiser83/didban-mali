"use client";

import { Alert } from "@/components/ui/alert";

import { Badge } from "@/components/ui/badge";

import { ProductCard } from "./product-card";

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
  return (
    <ProductCard className="ai-semantic-panel p-5 sm:p-6 bg-card border border-border/80 rounded-2xl shadow-sm space-y-4" aria-labelledby="semantic-panel-title">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/70">
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-2.5 py-0.5 rounded-full"><Icon name="shield" />هوش مصنوعی کمکی</span>
          <h3 id="semantic-panel-title" className="text-base font-bold text-foreground">رتبه‌بندی هوشمند مغایرت‌های احتمالی</h3>
        </div>
        <Badge className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${effective ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60" : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60"}`}>{effective ? "آماده" : "ارسال مسدود"}</Badge>
      </header>
      {error ? <Alert className="form-error border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-900" role="alert">{error}</Alert> : null}
      {candidateIds.length ? (
        <div className="semantic-candidate-boundary flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/70 bg-card/60 text-xs">
          <span className="flex items-center gap-2 font-semibold text-foreground bg-primary/10 px-3 py-1.5 rounded-xl shrink-0">
            <strong>{candidateIds.length.toLocaleString("fa-IR")}</strong>
            <small className="text-muted-foreground">نامزد مجاز</small>
          </span>
          <p className="text-muted-foreground flex-1">فقط موارد دارای وضعیت «نیازمند بررسی» وارد درخواست می‌شوند؛ نتیجه همچنان به تأیید انسان نیاز دارد.</p>
          <Button className="secondary-button text-xs shrink-0" onClick={() => void rank()} disabled={company.role === "viewer" || busy}>
            {busy ? "در حال کنترل…" : invocation ? "ثبت رتبه‌بندی تازه" : "رتبه‌بندی کنترل‌شده"}
          </Button>
        </div>
      ) : (
        <div className="semantic-empty flex items-start gap-3 p-4 rounded-xl border border-border/60 bg-muted/20 text-xs">
          <span className="text-emerald-600 dark:text-emerald-400 mt-0.5"><Icon name="check" /></span>
          <div>
            <strong className="block font-semibold text-foreground">نامزد مبهمی برای این اجرا وجود ندارد</strong>
            <p className="text-muted-foreground">تطبیق قطعی به AI نیاز ندارد؛ فقط نتایج potential_match واجد ورود هستند.</p>
          </div>
        </div>
      )}
      {ranking ? (
        <ol className="semantic-ranking-list space-y-2.5">
          {ranking.ranked_candidates.map((item, index) => (
            <li key={item.candidate_id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/70 bg-card/60 text-xs">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">{(index + 1).toLocaleString("fa-IR")}</span>
              <div className="flex-1">
                <strong className="block font-semibold text-foreground">{item.reason_fa}</strong>
                <small className="text-muted-foreground font-mono text-[11px]"><code dir="ltr">{item.candidate_id}</code></small>
              </div>
              <b className="font-semibold text-primary text-sm">{(Number(item.confidence) * 100).toLocaleString("fa-IR", { maximumFractionDigits: 0 })}٪</b>
            </li>
          ))}
        </ol>
      ) : invocation ? (
        <div className="ai-safe-stop flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/60 text-xs">
          <span className="text-amber-600 dark:text-amber-400 mt-0.5"><Icon name={invocation.status === "disabled" ? "shield" : "alert"} /></span>
          <div>
            <strong className="block font-semibold text-foreground">{invocation.status === "disabled" ? "درخواست پیش از ارسال متوقف شد" : "خروجی رتبه‌بندی پذیرفته نشد"}</strong>
            <p className="text-muted-foreground">{invocation.failure_message}</p>
            <small className="text-[11px] text-muted-foreground"><code dir="ltr" className="font-mono">{invocation.failure_code}</code></small>
          </div>
        </div>
      ) : null}
      <footer className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/70 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Icon name="users" />
          <span>هر پیشنهاد نیازمند بررسی انسانی است.</span>
        </div>
        <Link href={`/companies/${company.id}/assistant`} className="inline-flex items-center gap-1 text-primary hover:underline">
          تنظیمات و ممیزی <Icon name="chevron" />
        </Link>
      </footer>
    </ProductCard>
  );
}
