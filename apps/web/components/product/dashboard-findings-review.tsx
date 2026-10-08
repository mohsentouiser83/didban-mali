"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay, RiskBadge, StatusChip, toPersianDigits } from "@/components/ui/financial";
import { api } from "@/lib/product-api";
import type { DashboardFinding, EvidenceItem, EvidenceItemsResponse } from "@/lib/product-types";

const trendLabels: Partial<Record<DashboardFinding["finding_code"], string>> = {
  profit_drop: "کاهش سود", revenue_drop: "کاهش درآمد",
  expense_increase: "افزایش هزینه‌ها", receivables_increase: "افزایش مطالبات",
};

function findingTitle(finding: DashboardFinding) {
  const label = trendLabels[finding.finding_code];
  const ratio = finding.affected_ratio == null ? null : Number(finding.affected_ratio);
  return label && ratio != null && Number.isFinite(ratio)
    ? `${label} ${new Intl.NumberFormat("fa-IR", { style: "percent", maximumFractionDigits: 1 }).format(Math.abs(ratio))}`
    : finding.title_fa;
}

function nextStep(finding: DashboardFinding) {
  if (finding.finding_code === "receivables_increase") return "علت افزایش مطالبات و برنامهٔ وصول را بررسی کنید.";
  if (trendLabels[finding.finding_code]) return "عوامل تغییر و اسناد دو دوره را بررسی کنید؛ سپس تصمیم خود را ثبت کنید.";
  return "اسناد و شواهد این مورد را بررسی کنید؛ سپس تصمیم خود را ثبت کنید.";
}

export function DashboardFindingsReview({ companyId, findings, total, periodSelector, currentPeriod, comparisonPeriod, switching = false }: {
  companyId: string;
  findings: DashboardFinding[];
  total: number;
  periodSelector?: ReactNode;
  currentPeriod?: string;
  comparisonPeriod?: string;
  switching?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visible = findings.slice(0, 3);
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0];
  const base = `/companies/${companyId}`;
  return (
    <section className="dashboard-panel dashboard-findings" aria-labelledby="dashboard-findings-title" aria-busy={switching}>
      <div className="dashboard-panel-heading">
        <div><h2 id="dashboard-findings-title">در انتظار تصمیم شما</h2><p>یافته‌های اولویت‌دار دورهٔ انتخاب‌شده</p></div>
        <Link className="dashboard-text-link" href={`${base}/findings`}>همهٔ یافته‌ها · {toPersianDigits(total)} مورد<ChevronLeft size={14} /></Link>
      </div>
      {periodSelector && <div className="dashboard-findings-period">{periodSelector}</div>}
      {selected ? <>
        <div className="dashboard-selected-action">
          <div><strong>{findingTitle(selected)}</strong><p>{nextStep(selected)}</p></div>
          <Button asChild size="sm" disabled={switching}><Link href={`${base}/findings/${selected.id}`} aria-disabled={switching}
            onClick={(event) => { if (switching) event.preventDefault(); }}>بررسی و ثبت تصمیم<ChevronLeft size={14} /></Link></Button>
        </div>
        <div className="dashboard-review-queue" aria-label="انتخاب یافته">
          {visible.map((finding) => (
            <Button key={finding.id} variant="surface" size="auto" motion="none" className="dashboard-review-row"
              disabled={switching} aria-pressed={finding.id === selected.id} onClick={() => setSelectedId(finding.id)}>
              <span><strong>{findingTitle(finding)}</strong><small><StatusChip status={finding.workflow_status} size="sm" showIcon={false} /></small></span>
              <RiskBadge level={finding.priority_band} showIcon={false} label={({critical:"بحرانی",high:"بالا",medium:"متوسط",low:"پایین"})[finding.priority_band]} />
            </Button>
          ))}
        </div>
        <FindingEvidence key={`${companyId}:${selected.id}`} companyId={companyId} finding={selected} currentPeriod={currentPeriod} comparisonPeriod={comparisonPeriod} />
      </> : <div className="dashboard-empty-note"><strong>یافته‌ای برای بررسی وجود ندارد.</strong><p>پس از تحلیل داده‌های جدید، موارد قابل رسیدگی اینجا نمایش داده می‌شوند.</p></div>}
    </section>
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function amount(item?: EvidenceItem): string | null {
  if (!item) return null;
  const normalized = record(item.field_snapshot.normalized);
  const value = normalized.amount_irr ?? item.field_snapshot.value_irr;
  return (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) || (typeof value === "number" && Number.isFinite(value)) ? String(value) : null;
}

function FindingEvidence({ companyId, finding, currentPeriod, comparisonPeriod }: { companyId: string; finding: DashboardFinding; currentPeriod?: string; comparisonPeriod?: string }) {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError("");
    api<EvidenceItemsResponse>(`/companies/${companyId}/findings/${finding.id}/evidence`).then((response) => {
      if (!ignore) setEvidence(response.items);
    }).catch(() => {
      if (!ignore) setError("شواهد بارگذاری نشد. دوباره تلاش کنید یا پرونده یافته را باز کنید.");
    }).finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [companyId, finding.id, retry]);
  const bank = evidence.find((item) => item.source_entity_type === "bank_transaction");
  const accounting = evidence.find((item) => item.source_entity_type === "journal_entry" || item.source_entity_type === "journal_line");
  const current = evidence.find((item) => item.field_snapshot.position === "current");
  const previous = evidence.find((item) => item.field_snapshot.position === "previous");
  const hasSources = !!(bank || accounting);
  const sides = hasSources ? [{label:"ثبت حسابداری", item:accounting, period:undefined}, {label:"تراکنش بانک", item:bank, period:undefined}] : [{label:"دوره جاری", item:current, period:currentPeriod}, {label:"دوره مقایسه", item:previous, period:comparisonPeriod}];
  const multiple = evidence.filter((item) => item.evidence_type === "source_record").length > 2;
  return (
    <details className="dashboard-review-evidence">
      <summary>شواهد و مقایسهٔ مبالغ</summary>
      {loading ? <div role="status" aria-label="در حال بارگذاری شواهد"><Skeleton className="h-24 w-full" /></div> : error ? <div className="dashboard-evidence-error" role="alert"><p>{error}</p><Button size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}>تلاش دوباره</Button></div> : (hasSources || current || previous) ? <>
        <div className="dashboard-evidence-comparison">{sides.map(({label,item,period}) => <div key={label}><span>{label}</span>{period && <small>{period}</small>}<MoneyDisplay className="dashboard-comparison-money" amount={amount(item)} direction="neutral" size="lg" currency="ریال" executive /><small>{record(item?.field_snapshot.source_location).row_number != null ? `ردیف ${toPersianDigits(String(record(item?.field_snapshot.source_location).row_number))}` : item ? "محاسبه مستند" : "شاهد متناظر موجود نیست"}</small></div>)}</div>
        <details className="dashboard-exact-amounts"><summary>مبالغ دقیق به ریال</summary>
          {sides.map(({ label, item }) => <div key={label}><span>{label}</span><MoneyDisplay amount={amount(item)} currency="ریال" direction="neutral" size="sm" /></div>)}
        </details>
        {multiple && <p className="dashboard-evidence-limitation">اولین رکورد هر منبع نمایش داده شده است. همه رکوردها در پرونده یافته در دسترس‌اند.</p>}
      </> : <p className="dashboard-evidence-limitation">مبنای این یافته در محاسبات و قواعد پرونده ثبت شده است؛ شاهد عددی قابل‌مقایسه‌ای در این نما وجود ندارد.</p>}
      {finding.affected_amount_irr != null && <div className="dashboard-evidence-impact"><span>مبلغ تحت بررسی</span><MoneyDisplay amount={finding.affected_amount_irr} direction="neutral" currency="ریال" size="md" executive /></div>}
      <p className="dashboard-evidence-explanation">{trendLabels[finding.finding_code] ? "تغییر این شاخص از حد تعیین‌شده برای بررسی عبور کرده است. این هشدار به‌تنهایی علت تغییر را مشخص نمی‌کند." : finding.summary_fa}</p>
      <div className="dashboard-evidence-actions"><Link className="dashboard-text-link" href={`/companies/${companyId}/findings/${finding.id}`}>همه شواهد و منابع</Link></div>
    </details>
  );
}
