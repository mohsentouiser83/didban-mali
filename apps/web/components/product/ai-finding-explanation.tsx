"use client";

import { Alert } from "@/components/ui/alert";

import { Badge } from "@/components/ui/badge";

import { ProductCard } from "./product-card";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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

  if (loading) {
    return (
      <ProductCard className="ai-finding-panel is-loading p-5 sm:p-6 bg-card border border-border/80 rounded-2xl shadow-sm space-y-3" aria-label="در حال دریافت توضیح هوشمند">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </ProductCard>
    );
  }
  const explanation = invocation && isExplanation(invocation.output) ? invocation.output : null;
  const effective = settings?.explanations_effective ?? false;
  return (
    <ProductCard className={`ai-finding-panel p-5 sm:p-6 bg-card border border-border/80 rounded-2xl shadow-sm space-y-4 ${effective ? "is-ready" : "is-locked"}`} aria-labelledby="ai-finding-title">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/70">
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-2.5 py-0.5 rounded-full"><Icon name="shield" />تحلیل هوشمند</span>
          <h3 id="ai-finding-title" className="text-base font-bold text-foreground">شرح و تفسیر تحلیلی یافته</h3>
        </div>
        <Badge className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${effective ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60" : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60"}`}>{effective ? "آماده" : "ارسال مسدود"}</Badge>
      </header>
      {error ? <Alert className="form-error border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-900" role="alert">{error}</Alert> : null}
      {explanation ? (
        <div className="ai-explanation-output p-4 rounded-xl border border-border/70 bg-card/60 space-y-3 text-xs">
          <div>
            <span className="block text-[11px] font-semibold text-primary mb-0.5">جمع‌بندی</span>
            <p className="text-foreground/90 font-medium">{explanation.summary_fa}</p>
          </div>
          <div>
            <span className="block text-[11px] font-semibold text-primary mb-0.5">چرا مهم است؟</span>
            <p className="text-muted-foreground">{explanation.why_it_matters_fa}</p>
          </div>
          {explanation.caveats_fa.length ? (
            <div>
              <span className="block text-[11px] font-semibold text-primary mb-0.5">ملاحظات</span>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">{explanation.caveats_fa.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          ) : null}
          <footer className="flex items-center justify-between pt-3 border-t border-border/60 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Icon name="evidence" />{explanation.referenced_evidence_ids.length.toLocaleString("fa-IR")} شاهد ارجاع‌شده</span>
            <strong className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400"><Icon name="users" />نیازمند بررسی انسانی</strong>
          </footer>
        </div>
      ) : invocation ? (
        <div className="ai-safe-stop flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/60 text-xs">
          <span className="text-amber-600 dark:text-amber-400 mt-0.5"><Icon name={invocation.status === "disabled" ? "shield" : "alert"} /></span>
          <div className="space-y-1">
            <strong className="block font-semibold text-foreground">{invocation.status === "disabled" ? "درخواست بدون خروج داده متوقف شد" : "پاسخ قابل استفاده تولید نشد"}</strong>
            <p className="text-muted-foreground">{invocation.failure_message ?? "گاردریل‌ها اجازه نمایش این خروجی را ندادند؛ تحلیل قطعی پرونده بدون تغییر باقی مانده است."}</p>
            <small className="block text-[11px] text-muted-foreground"><code dir="ltr" className="font-mono">{invocation.failure_code ?? invocation.status}</code> · {invocation.prompt_version}</small>
          </div>
        </div>
      ) : (
        <div className="ai-explanation-empty flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl border border-dashed border-border/70 bg-muted/20 text-xs">
          <div className="ai-input-boundary space-y-1.5 border-r-2 border-primary/40 pr-3">
            <span className="inline-flex items-center gap-1.5 text-primary font-semibold"><Icon name="target" />ورودی این درخواست</span>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
              <li>شناسه و کد دلیل یافته</li>
              <li>اعداد مجاز محاسبات</li>
              <li>شناسه شواهد موجود</li>
            </ul>
          </div>
          <div>
            <strong className="block font-semibold text-foreground mb-0.5">{effective ? "توضیحی برای این پرونده ثبت نشده است" : "شرایط امنیتی هنوز کامل نیست"}</strong>
            <p className="text-muted-foreground">{effective ? "درخواست را ثبت کنید تا پاسخ پس از اعتبارسنجی نمایش داده شود." : "درخواست قابل ثبت و ممیزی است، اما پیش از ارسال خارجی به‌صورت ایمن متوقف می‌شود."}</p>
          </div>
        </div>
      )}
      <footer className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/70 text-xs">
        <Button className="secondary-button inline-flex items-center gap-1.5 text-xs" onClick={() => void requestExplanation()} disabled={!canRequest || busy}>
          {busy ? <><span className="loading-ring inline-block" />در حال کنترل درخواست…</> : <><Icon name="activity" />{invocation ? "ثبت درخواست تازه" : "درخواست توضیح کنترل‌شده"}</>}
        </Button>
        <Link href={`/companies/${company.id}/assistant`} className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
          مشاهده تنظیمات و دفتر ممیزی <Icon name="chevron" />
        </Link>
        {!canRequest ? <small className="text-muted-foreground">نقش مشاهده‌گر امکان ثبت درخواست ندارد.</small> : null}
      </footer>
    </ProductCard>
  );
}
