import React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RiskBadge, RiskLevel } from "./risk-badge";
import { StatusChip, FinancialStatus } from "./status-chip";
import { EvidenceSourceTag, EvidenceSourceType } from "./evidence-source-tag";
import { MoneyDisplay, toPersianDigits } from "./money-display";
import { ShieldCheck, Calculator, FileText, CheckCircle2, Clock, Ban, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface EvidenceLineageItem {
  id: string;
  sourceType: EvidenceSourceType;
  title: string;
  description: string;
  fileName?: string;
  sheetName?: string;
  rowNumber?: number;
  sha256?: string;
  rawPayload?: Record<string, unknown>;
}

export interface FindingEvidenceDetail {
  id: string;
  title: string;
  riskLevel: RiskLevel;
  status: FinancialStatus;
  priorityScore: number;
  amount: number | string;
  ratioToRevenue?: number;
  factors: {
    impact: { score: number; weight: number; reason: string };
    materiality: { score: number; weight: number; reason: string };
    confidence: { score: number; weight: number; reason: string };
    urgency: { score: number; weight: number; reason: string };
  };
  ruleCode: string;
  ruleDescription: string;
  evidenceItems: EvidenceLineageItem[];
}

export interface EvidenceDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finding: FindingEvidenceDetail | null;
  onAction?: (action: "confirmed" | "follow_up" | "dismissed" | "resolved", note?: string) => void;
}

export function EvidenceDrawer({ open, onOpenChange, finding, onAction }: EvidenceDrawerProps) {
  if (!finding) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-xl lg:max-w-2xl overflow-y-auto p-0 border-e border-[var(--ds-border)] bg-[var(--ds-background)] text-foreground"
      >
        {/* Header */}
        <SheetHeader className="p-6 border-b border-[var(--ds-border)] bg-[var(--ds-card)] sticky top-0 z-10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <RiskBadge level={finding.riskLevel} score={finding.priorityScore} />
              <StatusChip status={finding.status} />
            </div>
            <span className="font-mono text-xs text-muted-foreground">کد: {finding.ruleCode}</span>
          </div>
          <SheetTitle className="text-lg font-extrabold text-start mt-2 leading-snug">
            {finding.title}
          </SheetTitle>
          <SheetDescription className="text-start text-xs text-muted-foreground mt-1">
            {finding.ruleDescription}
          </SheetDescription>
        </SheetHeader>

        <div className="p-6 space-y-6">
          {/* Financial Impact Box */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-card)] p-4">
            <div>
              <span className="block text-xs text-muted-foreground mb-1">مبلغ درگیر / اثر مالی:</span>
              <MoneyDisplay amount={finding.amount} currency="ریال" size="xl" />
            </div>
            {finding.ratioToRevenue !== undefined && (
              <div className="border-s border-[var(--ds-border)] ps-4">
                <span className="block text-xs text-muted-foreground mb-1">نسبت به درآمد دوره:</span>
                <span className="font-mono text-lg font-extrabold text-foreground">
                  {toPersianDigits((finding.ratioToRevenue * 100).toFixed(1))}٪
                </span>
              </div>
            )}
          </div>

          {/* 4-Factor Scoring Breakdown */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold text-muted-foreground flex items-center gap-1.5">
              <Calculator className="size-3.5" />
              دفتر محاسبه امتیاز اولویت (۴ عامل قطعی)
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-card)] p-3">
                <div className="flex justify-between font-bold text-foreground mb-1">
                  <span>اثر مالی (۴۰٪)</span>
                  <span className="font-mono">{toPersianDigits(finding.factors.impact.score)}/۱۰۰</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{finding.factors.impact.reason}</p>
              </div>

              <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-card)] p-3">
                <div className="flex justify-between font-bold text-foreground mb-1">
                  <span>اهمیت نسبی (۲۵٪)</span>
                  <span className="font-mono">{toPersianDigits(finding.factors.materiality.score)}/۱۰۰</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{finding.factors.materiality.reason}</p>
              </div>

              <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-card)] p-3">
                <div className="flex justify-between font-bold text-foreground mb-1">
                  <span>سطح اطمینان (۲۰٪)</span>
                  <span className="font-mono">{toPersianDigits(finding.factors.confidence.score)}/۱۰۰</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{finding.factors.confidence.reason}</p>
              </div>

              <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-card)] p-3">
                <div className="flex justify-between font-bold text-foreground mb-1">
                  <span>فوریت پیگیری (۱۵٪)</span>
                  <span className="font-mono">{toPersianDigits(finding.factors.urgency.score)}/۱۰۰</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{finding.factors.urgency.reason}</p>
              </div>
            </div>
          </div>

          {/* Traceable Lineage (Evidence Items) */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" />
              زنجیره شواهد و ردیابی تا فایل منبع (Data Lineage)
            </h4>
            <div className="space-y-2.5">
              {finding.evidenceItems.map((item, index) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-card)] p-4 space-y-2 transition-colors hover:border-[var(--ds-border-strong)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="grid size-5 place-items-center rounded-full bg-muted text-[10px] font-mono font-bold text-muted-foreground">
                        {toPersianDigits(index + 1)}
                      </span>
                      <EvidenceSourceTag source={item.sourceType} size="sm" />
                      <strong className="text-xs font-bold text-foreground">{item.title}</strong>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed ps-7">{item.description}</p>

                  {(item.fileName || item.rowNumber) && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground ps-3 font-mono">
                      <FileText className="size-3 text-muted-foreground" />
                      {item.fileName && <span>فایل: {item.fileName}</span>}
                      {item.sheetName && <span>شیت: {item.sheetName}</span>}
                      {item.rowNumber && <span>ردیف: {toPersianDigits(item.rowNumber)}</span>}
                      {item.sha256 && (
                        <span className="truncate max-w-[140px] opacity-70" title={item.sha256}>
                          هش: {item.sha256}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quick Review Action Bar */}
          {onAction && (
            <div className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-card)] p-4 space-y-3 sticky bottom-0 z-10 shadow-lg">
              <span className="block text-xs font-bold text-foreground">اقدام مشاور / تصمیم‌گیری:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-xs border-blue-500/30 text-blue-700 hover:bg-blue-500/10 dark:text-blue-400"
                  onClick={() => onAction("confirmed")}
                >
                  <CheckCircle2 className="size-3.5" />
                  تأیید یافته
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-xs border-amber-500/30 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                  onClick={() => onAction("follow_up")}
                >
                  <Clock className="size-3.5" />
                  شروع پیگیری
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-xs border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                  onClick={() => onAction("resolved")}
                >
                  <CheckCheck className="size-3.5" />
                  حل‌شد
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onAction("dismissed")}
                >
                  <Ban className="size-3.5" />
                  رد / بی‌اثر
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
