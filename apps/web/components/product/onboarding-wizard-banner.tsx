"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
  Rocket,
} from "@/components/ui/icons";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/product-api";
import type { OnboardingStatus } from "@/lib/product-types";
import { FinancialValidationModal } from "./financial-validation-modal";

interface OnboardingWizardBannerProps {
  companyId: string;
  onGoLiveCompleted?: () => void;
}

export function OnboardingWizardBanner({
  companyId,
  onGoLiveCompleted,
}: OnboardingWizardBannerProps) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const fetchStatus = async () => {
    try {
      const data = await api<OnboardingStatus>(
        `/companies/${companyId}/onboarding`,
      );
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
      await api(`/companies/${companyId}/onboarding/go-live`, {
        method: "POST",
      });
      await fetchStatus();
      if (onGoLiveCompleted) {
        onGoLiveCompleted();
      }
    } catch (err: any) {
      alert(
        err.detail ||
          "راه‌اندازی با خطا مواجه شد. لطفاً ابتدا اعداد مالی را تأیید کنید.",
      );
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <>
      <div
        dir="rtl"
        className="mb-6 rounded-[var(--ds-card-radius)] border border-primary/20 bg-card p-5 shadow-[var(--ds-shadow-sm)] text-foreground"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg  text-primary">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg">
                  راه‌اندازی رسمی سامانه دیدبان مالی
                </h3>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {status.progress_percentage}٪ تکمیل شده
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                مراحل ۸ گانه راه‌اندازی و اعتبارسنجی اولیه جهت شروع بهره‌برداری
                عملیاتی
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status.steps[4].status !== "completed" ? (
              <Button variant="default"
                size="sm"
                onClick={() => setShowValidationModal(true)}
                className="gap-2"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>تأیید اعداد مالی پایه</span>
              </Button>
            ) : (
              <Button variant="success"
                size="sm"
                onClick={handleGoLive}
                disabled={isActivating}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                <span>
                  {isActivating ? "در حال ثبت..." : "ورود به بهره‌برداری رسمی"}
                </span>
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
                    ? "border-ds-success/20 bg-ds-success/5 text-ds-success"
                    : isInProgress
                      ? "border-primary/30 bg-primary/5 text-primary font-medium"
                      : "border-border/30 bg-muted/20 text-muted-foreground"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] opacity-70">
                    گام {idx + 1}
                  </span>
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-ds-success" />
                  ) : isInProgress ? (
                    <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
                  )}
                </div>
                <span className="line-clamp-2 leading-tight">
                  {step.title_fa}
                </span>
              </div>
            );
          })}
        </div>

        {/* Current Blocker & Action Alert */}
        {status.active_blocker && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ds-warning/20 bg-ds-warning/10 p-3 text-xs text-ds-warning">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-ds-warning shrink-0" />
              <span>
                <strong>اقدام لازم:</strong> {status.active_blocker}
              </span>
              {status.responsible_party_fa && (
                <span className="rounded bg-ds-warning/20 px-2 py-0.5 text-[11px] font-medium text-ds-warning">
                  مسئول: {status.responsible_party_fa}
                </span>
              )}
            </div>

            {status.next_action_fa && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="gap-1 border-ds-warning/30 hover:bg-ds-warning/20"
              >
                <Link
                  href={
                    status.steps.find((s) => s.cta_route)?.cta_route ||
                    `/companies/${companyId}/data/connections`
                  }
                >
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
