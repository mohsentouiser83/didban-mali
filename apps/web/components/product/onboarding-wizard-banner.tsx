"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, AlertCircle, ArrowLeft, ShieldCheck, Sparkles, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/product-api";
import type { OnboardingStatus } from "@/lib/product-types";
import { FinancialValidationModal } from "./financial-validation-modal";

interface OnboardingWizardBannerProps {
  companyId: string;
  onGoLiveCompleted?: () => void;
}

export function OnboardingWizardBanner({ companyId, onGoLiveCompleted }: OnboardingWizardBannerProps) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const fetchStatus = async () => {
    try {
      const data = await api<OnboardingStatus>(`/companies/${companyId}/onboarding`);
      setStatus(data);
    } catch (e) {
      console.error("Failed to load onboarding status:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    fetchStatus();
  }, [companyId]);

  if (loading || !status || status.is_live) {
    // If company is already live, we do NOT show onboarding noise
    return null;
  }

  const handleGoLive = async () => {
    setIsActivating(true);
    try {
      await api(`/companies/${companyId}/onboarding/go-live`, { method: "POST" });
      await fetchStatus();
      if (onGoLiveCompleted) {
        onGoLiveCompleted();
      }
    } catch (err: any) {
      alert(err.detail || "راه‌اندازی با خطا مواجه شد. لطفاً ابتدا اعداد مالی را تأیید کنید.");
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <>
      <div
        dir="rtl"
        className="mb-6 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-card to-card p-5 shadow-sm text-foreground"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg">راه‌اندازی رسمی سامانه دیدبان مالی</h3>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {status.progress_percentage}٪ تکمیل شده
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                مراحل ۸ گانه راه‌اندازی و اعتبارسنجی اولیه جهت شروع بهره‌برداری عملیاتی
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status.steps[4].status !== "completed" ? (
              <Button
                size="sm"
                onClick={() => setShowValidationModal(true)}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>تأیید اعداد مالی پایه</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleGoLive}
                disabled={isActivating}
                className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
              >
                <Sparkles className="h-4 w-4" />
                <span>{isActivating ? "در حال ثبت..." : "ورود به بهره‌برداری رسمی"}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Steps Grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {status.steps.map((step, idx) => {
            const isCompleted = step.status === "completed";
            const isInProgress = step.status === "in_progress";
            return (
              <div
                key={step.key}
                className={`flex flex-col rounded-lg p-2.5 text-xs transition-colors border ${
                  isCompleted
                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-950 dark:text-emerald-300"
                    : isInProgress
                    ? "border-primary/30 bg-primary/5 text-primary font-medium"
                    : "border-border/30 bg-muted/20 text-muted-foreground"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] opacity-70">گام {idx + 1}</span>
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : isInProgress ? (
                    <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
                  )}
                </div>
                <span className="line-clamp-2 leading-tight">{step.title_fa}</span>
              </div>
            );
          })}
        </div>

        {/* Current Blocker & Action Alert */}
        {status.active_blocker && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong>اقدام لازم:</strong> {status.active_blocker}
              </span>
              {status.responsible_party_fa && (
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                  مسئول: {status.responsible_party_fa}
                </span>
              )}
            </div>

            {status.next_action_fa && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 border-amber-500/30 hover:bg-amber-500/20"
              >
                <Link href={status.steps.find((s) => s.cta_route)?.cta_route || `/companies/${companyId}/data`}>
                  <span>{status.next_action_fa}</span>
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>

      <FinancialValidationModal
        companyId={companyId}
        open={showValidationModal}
        onOpenChange={setShowValidationModal}
        onValidated={() => {
          fetchStatus();
          setShowValidationModal(false);
        }}
      />
    </>
  );
}
