"use client";

import { type ReactNode } from "react";
import {
  CheckCircleIcon,
  PlayCircleIcon,
  CircleIcon,
  SparkleIcon,
  ArrowLeftIcon,
} from "@phosphor-icons/react";
import { Button, ButtonLink } from "./button";
import { cn, persian } from "@/lib/utils";

export type OnboardingStepStatus = "completed" | "active" | "pending";

export interface OnboardingStep {
  id: string;
  title: string;
  status: OnboardingStepStatus;
  stepNumber?: number;
  ctaText?: string;
  onClick?: () => void;
  href?: string;
  icon?: ReactNode;
}

export interface SmartEmptyStateProps {
  title?: string;
  icon?: ReactNode;
  steps: OnboardingStep[];
  primaryCta?: {
    text: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

export function SmartEmptyState({
  title = "هنوز داده‌ای ثبت نشده است",
  icon,
  steps = [],
  primaryCta,
  className,
}: SmartEmptyStateProps) {
  // Find the active step (first 'active' or first non-completed step)
  const activeStep =
    steps.find((s) => s.status === "active") ||
    steps.find((s) => s.status !== "completed") ||
    steps[0];

  const ctaConfig = primaryCta || (activeStep
    ? {
        text: activeStep.ctaText || `انجام ${activeStep.title}`,
        onClick: activeStep.onClick,
        href: activeStep.href,
      }
    : undefined);

  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        "flex flex-col items-center justify-center rounded-panel border border-border/80 bg-surface p-6 sm:p-10 text-center shadow-sm motion-safe:animate-fade-in",
        className,
      )}
    >
      {/* Empty state title */}
      <div className="mb-4 flex flex-col items-center gap-3">
        <span
          className="grid size-14 place-items-center rounded-2xl border border-primary/20 bg-primary-soft text-primary shadow-sm"
          aria-hidden
        >
          {icon || <SparkleIcon size={28} weight="duotone" />}
        </span>


        <h2 className="font-display text-xl font-medium text-foreground sm:text-2xl">
          {title}
        </h2>

      </div>

      {/* Onboarding Steps Grid */}
      {steps.length > 0 && (
        <ol
          role="list"
          aria-label="مراحل راه‌اندازی"
          className="my-6 grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-3 text-start"
        >
          {steps.map((step, index) => {
            const stepNum = step.stepNumber ?? index + 1;
            const isCompleted = step.status === "completed";
            const isActive = step.status === "active";
            const isPending = step.status === "pending";

            return (
              <li
                key={step.id}
                role="listitem"
                aria-current={isActive ? "step" : undefined}
                onClick={step.onClick}
                className={cn(
                  "relative flex flex-col justify-between rounded-panel p-4 sm:p-5 transition-all duration-200 border",
                  step.onClick && "cursor-pointer",
                  isActive &&
                    "border-primary bg-surface shadow-action ring-2 ring-primary/20",
                  isCompleted &&
                    "border-success/30 bg-success-soft/20 text-foreground",
                  isPending &&
                    "border-border/70 bg-canvas/40 opacity-80",
                )}
              >
                <div>
                  {/* Step Status Header */}
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-muted">
                      گام {persian(stepNum)}
                    </span>

                    {isCompleted && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                        <CheckCircleIcon size={14} weight="fill" aria-hidden />
                        تکمیل شده
                      </span>
                    )}

                    {isActive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary ring-1 ring-primary/30">
                        <PlayCircleIcon size={14} weight="fill" aria-hidden />
                        گام جاری
                      </span>
                    )}

                    {isPending && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-normal text-muted border border-border/60">
                        <CircleIcon size={13} aria-hidden />
                        در انتظار
                      </span>
                    )}
                  </div>


                  <h3 className={cn(
                    "text-sm font-medium",
                    isActive ? "text-primary font-semibold" : "text-foreground",
                  )}>
                    {step.title}
                  </h3>

                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Prominent CTA for Active Step */}
      {ctaConfig && (ctaConfig.onClick || ctaConfig.href) && (
        <div className="mt-2 flex flex-col items-center gap-2">
          {ctaConfig.href ? (
            <ButtonLink
              href={ctaConfig.href}
              variant="primary"
              data-testid="smart-empty-state-primary-cta"
              className="h-11 px-7 shadow-action text-sm font-medium"
            >
              <span>{ctaConfig.text}</span>
              <ArrowLeftIcon size={16} aria-hidden />
            </ButtonLink>
          ) : (
            <Button
              type="button"
              onClick={ctaConfig.onClick}
              variant="primary"
              data-testid="smart-empty-state-primary-cta"
              className="h-11 px-7 shadow-action text-sm font-medium"
            >
              <span>{ctaConfig.text}</span>
              <ArrowLeftIcon size={16} aria-hidden />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
