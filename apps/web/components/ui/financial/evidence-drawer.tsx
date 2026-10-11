import React, { useState, useEffect } from "react";
import { Drawer, DrawerSection, DrawerDetails, DrawerFooter } from "@/components/ui/drawer";
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
    <Drawer open={open} onOpenChange={onOpenChange} title={finding.title} description={finding.ruleDescription}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><RiskBadge level={finding.riskLevel} score={finding.priorityScore} /><StatusChip status={finding.status} /></div>
        <bdi dir="ltr" className="text-xs text-muted-foreground">{finding.ruleCode}</bdi>
      </div>
          {/* Financial Impact Box */}
      <DrawerDetails>
        <div><dt>مبلغ مرتبط</dt><dd><MoneyDisplay amount={finding.amount} currency="ریال" /></dd></div>
        {finding.ratioToRevenue !== undefined && <div><dt>نسبت به درآمد دوره</dt><dd>{toPersianDigits((finding.ratioToRevenue * 100).toFixed(1))}٪</dd></div>}
      </DrawerDetails>

      <DrawerSection title="محاسبه امتیاز اولویت">
        {([['impact', 'اثر مالی', 40], ['materiality', 'اهمیت نسبی', 25], ['confidence', 'اطمینان', 20], ['urgency', 'فوریت', 15]] as const).map(([key, label, weight]) => <DrawerSection key={key}>
          <DrawerDetails><div><dt>{label} ({toPersianDigits(weight)}٪)</dt><dd>{toPersianDigits(finding.factors[key].score)}/۱۰۰</dd></div></DrawerDetails>
          <p className="text-sm text-muted-foreground leading-7">{finding.factors[key].reason}</p>
        </DrawerSection>)}
      </DrawerSection>

      <DrawerSection title="شواهد و فایل منبع">
        {finding.evidenceItems.map((item, index) => <DrawerSection key={item.id} title={item.title}>
          <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{toPersianDigits(index + 1)}</span><EvidenceSourceTag source={item.sourceType} size="sm" /></div>
          <p className="text-sm text-muted-foreground leading-7">{item.description}</p>
          <DrawerDetails>
            {item.fileName && <div><dt>فایل</dt><dd><bdi>{item.fileName}</bdi></dd></div>}
            {item.sheetName && <div><dt>شیت</dt><dd><bdi>{item.sheetName}</bdi></dd></div>}
            {item.rowNumber != null && <div><dt>ردیف منبع</dt><dd>{toPersianDigits(item.rowNumber)}</dd></div>}
            {item.sha256 && <div><dt>هش فایل</dt><dd><bdi dir="ltr">{item.sha256}</bdi></dd></div>}
          </DrawerDetails>
        </DrawerSection>)}
      </DrawerSection>

          {/* Quick Review Action Bar */}
          {onAction && (
            <DrawerSection title="نتیجه بررسی">
              <Input
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
            </DrawerSection>
          )}
    </Drawer>
  );
}
