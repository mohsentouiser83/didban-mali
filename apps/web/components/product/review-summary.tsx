import { Badge } from "@/components/ui/badge";
import { DetailField } from "@/components/ui/field-layout";
import { Activity, AlertTriangle, Calendar, FileText, GitBranch, User, Wallet } from "@/components/ui/icons";
import { MoneyDisplay, toJalaliDate, toPersianDigits } from "@/components/ui/financial";
import { RiskBadge } from "@/components/ui/financial/risk-badge";
import { StatusBadge } from "@/components/ui/financial/status-badge";
import { toman } from "@/lib/cashflow-amounts";
import { reviewStatusLabels, reviewSeverityLabels, reviewReconciliationLabels, type ReviewItem, type ReviewPreviewData } from "@/lib/review";

export function ReviewSummary({ detail, item }: { detail: ReviewPreviewData; item: ReviewItem }) {
  return <section aria-label="خلاصه بررسی" className="grid min-w-0 gap-5">
    <dl className="grid min-w-0 grid-cols-2 gap-x-5 gap-y-5">
      <DetailField icon={Wallet} label="مبلغ مرتبط" className="[&_dd]:py-1">{detail.financial_impact_irr !== null ? <MoneyDisplay amount={toman(detail.financial_impact_irr)} currency="تومان" size="lg" direction="neutral" wrap /> : <span className="text-sm text-muted-foreground">مشخص نیست</span>}</DetailField>
      <DetailField icon={AlertTriangle} label="اهمیت"><RiskBadge level={item.severity} label={reviewSeverityLabels[item.severity] ?? "نامشخص"} size="sm" /></DetailField>
      <DetailField icon={GitBranch} label="وضعیت تطبیق">{detail.reconciliation_state && detail.reconciliation_state !== "not_applicable" ? <Badge variant="secondary">{reviewReconciliationLabels[detail.reconciliation_state]}</Badge> : "—"}</DetailField>
      <DetailField icon={Activity} label="وضعیت بررسی"><StatusBadge status={detail.status} label={reviewStatusLabels[detail.status] ?? "نامشخص"} /></DetailField>
      {detail.assigned_to_name && <DetailField icon={User} label="مسئول پیگیری">{detail.assigned_to_name}</DetailField>}
      {detail.due_date && <DetailField icon={Calendar} label="موعد پیگیری">{toJalaliDate(detail.due_date)}</DetailField>}
      {detail.summary_fa && !detail.proposals?.length && <DetailField icon={FileText} label="شرح بررسی" className="col-span-2">{toPersianDigits(detail.summary_fa)}</DetailField>}
    </dl>
  </section>;
}
