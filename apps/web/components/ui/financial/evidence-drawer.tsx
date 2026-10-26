import { DetailSection, DetailGroup, DetailField, ControlLabel, fieldIcon } from "@/components/ui/field-layout";
import React, { useState, useEffect } from "react";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { RiskBadge, RiskLevel } from "./risk-badge";
import { StatusChip, FinancialStatus } from "./status-chip";
import { EvidenceSourceTag, EvidenceSourceType } from "./evidence-source-tag";
import { MoneyDisplay, toPersianDigits } from "./money-display";
import {
  CheckCircle2,
  Clock,
  Ban,
  CheckCheck,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  onAction?: (
    action: "confirmed" | "follow_up" | "dismissed" | "resolved",
    note?: string,
  ) => void;
}

export function EvidenceDrawer({
  open,
  onOpenChange,
  finding,
  onAction,
}: EvidenceDrawerProps) {
  const [actionNote, setActionNote] = useState("");

  useEffect(() => {
    setActionNote("");
  }, [finding?.id, open]);

  if (!finding) return null;

  return (
    <Drawer size="wide" open={open} onOpenChange={onOpenChange} title={finding.title} description={finding.ruleDescription}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><RiskBadge level={finding.riskLevel} score={finding.priorityScore} /><StatusChip status={finding.status} /></div>
        <bdi dir="ltr" className="text-xs text-muted-foreground">{finding.ruleCode}</bdi>
      </div>
          {/* Financial Impact Box */}
      <DetailGroup>
        <DetailField icon={fieldIcon("مبلغ مرتبط")} label="مبلغ مرتبط"><MoneyDisplay amount={finding.amount} currency="ریال" /></DetailField>
        {finding.ratioToRevenue !== undefined && <DetailField icon={fieldIcon("نسبت به درآمد دوره")} label="نسبت به درآمد دوره">{toPersianDigits((finding.ratioToRevenue * 100).toFixed(1))}٪</DetailField>}
      </DetailGroup>

      <DetailSection title="محاسبه امتیاز اولویت">
        {([['impact', 'اثر مالی', 40], ['materiality', 'اهمیت نسبی', 25], ['confidence', 'اطمینان', 20], ['urgency', 'فوریت', 15]] as const).map(([key, label, weight]) => <DetailSection key={key}>
          <DetailGroup><DetailField icon={fieldIcon(label)} label={<>{label} ({toPersianDigits(weight)}٪)</>}>{toPersianDigits(finding.factors[key].score)}/۱۰۰</DetailField></DetailGroup>
          <DetailGroup><DetailField icon={fieldIcon("دلیل امتیاز")} label="دلیل امتیاز">{finding.factors[key].reason}</DetailField></DetailGroup>
        </DetailSection>)}
      </DetailSection>

      <DetailSection title="شواهد و فایل منبع">
        {finding.evidenceItems.map((item, index) => <DetailSection key={item.id} title={item.title}>
          <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{toPersianDigits(index + 1)}</span><EvidenceSourceTag source={item.sourceType} size="sm" /></div>
          <DetailGroup><DetailField icon={fieldIcon("شرح شاهد")} label="شرح شاهد">{item.description}</DetailField></DetailGroup>
          <DetailGroup>
            {item.fileName && <DetailField icon={fieldIcon("فایل")} label="فایل"><bdi>{item.fileName}</bdi></DetailField>}
            {item.sheetName && <DetailField icon={fieldIcon("شیت")} label="شیت"><bdi>{item.sheetName}</bdi></DetailField>}
            {item.rowNumber != null && <DetailField icon={fieldIcon("ردیف منبع")} label="ردیف منبع">{toPersianDigits(item.rowNumber)}</DetailField>}
            {item.sha256 && <DetailField icon={fieldIcon("هش فایل")} label="هش فایل"><bdi dir="ltr">{item.sha256}</bdi></DetailField>}
          </DetailGroup>
        </DetailSection>)}
      </DetailSection>

          {/* Quick Review Action Bar */}
          {onAction && (
            <DetailSection title="نتیجه بررسی">
              <ControlLabel htmlFor="evidence-action-note" icon={fieldIcon("یادداشت")}>یادداشت مشاور</ControlLabel>
              <Input
                id="evidence-action-note"
                size="sm"
                aria-label="یادداشت توضیحی مشاور"
                placeholder="یادداشت توضیحی مشاور (اختیاری)..."
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                dir="rtl"
              />
              <DrawerFooter>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 border-primary/30 text-primary hover:bg-primary/10"
                  onClick={() =>
                    onAction("confirmed", actionNote.trim() || undefined)
                  }
                >
                  <CheckCircle2 className="size-3.5" />
                  تأیید یافته
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 border-ds-warning/30 text-ds-warning hover:bg-ds-warning/10"
                  onClick={() =>
                    onAction("follow_up", actionNote.trim() || undefined)
                  }
                >
                  <Clock className="size-3.5" />
                  شروع پیگیری
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 border-ds-success/30 text-ds-success hover:bg-ds-success/10"
                  onClick={() =>
                    onAction("resolved", actionNote.trim() || undefined)
                  }
                >
                  <CheckCheck className="size-3.5" />
                  حل‌شد
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    onAction("dismissed", actionNote.trim() || undefined)
                  }
                >
                  <Ban className="size-3.5" />
                  رد / بی‌اثر
                </Button>
              </DrawerFooter>
            </DetailSection>
          )}
    </Drawer>
  );
}
