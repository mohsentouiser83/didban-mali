"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MoneyDisplay,
  toPersianDigits,
  RiskBadge,
  StatusChip,
} from "@/components/ui/financial";
import { toast } from "sonner";
import {
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
  RotateCcw,
  UserPlus,
  AlertCircle,
  FileCheck2,
  XCircle,
  Calendar,
  Layers,
  RefreshCcw,
  Check,
  Clock,
  ChevronDown,
  ChevronRight,
} from "@/components/ui/icons";
import { ProductCard } from "./product-card";
import { FindingTitleTransition } from "./finding-title-transition";
import { getFindingTitle } from "./finding-navigation-preview";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toJalaliDate, toJalaliDateTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { api, API_URL } from "@/lib/product-api";
import type {
  Company,
  EvidenceItem,
  EvidenceItemsResponse,
  Finding,
  Member,
  PriorityBand,
  ReviewTimelineItem,
  ReviewTimelineResponse,
} from "@/lib/product-types";

import { Icon } from "./icons";
import { FindingReviewPanel } from "./finding-review-panel";

const bandLabels: Record<PriorityBand, string> = {
  critical: "بحرانی",
  high: "بالا",
  medium: "متوسط",
  low: "پایین",
};

const bandBadgeClasses: Record<PriorityBand, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-ds-warning/10 text-ds-warning border-ds-warning/20",
  medium: "bg-primary/10 text-primary border-primary/20",
  low: "bg-muted text-muted-foreground border-border",
};

const assertionLabels: Record<Finding["assertion_status"], string> = {
  hypothesis: "فرضیه نیازمند بررسی",
  deterministic: "نتیجه قطعی قاعده‌ای",
};

const workflowLabels: Record<Finding["workflow_status"], string> = {
  needs_review: "نیازمند بررسی",
  confirmed: "تأییدشده",
  dismissed: "ردشده",
  follow_up: "در پیگیری",
  resolved: "حل‌شده",
};

const evidenceLabels: Record<EvidenceItem["evidence_type"], string> = {
  rule: "قاعده تشخیص",
  calculation: "محاسبه",
  source_record: "رکورد منبع",
  comparison: "مقایسه دوره",
  coverage: "پوشش ورودی",
};

const factorLabels = {
  impact: "اثر",
  materiality: "اهمیت",
  confidence: "اطمینان",
  urgency: "فوریت",
} as const;

const fieldLabels: Record<string, string> = {
  amount_difference_irr: "اختلاف مبلغ",
  analysis_run_id: "شناسه تحلیل",
  assertion_status: "نوع ادعا",
  bank_transaction_id: "شناسه تراکنش بانکی",
  booking_date: "تاریخ تراکنش",
  claim_code: "کد ادعا",
  confidence_score: "امتیاز اطمینان",
  date_difference_days: "اختلاف روز",
  description: "شرح",
  finding_code: "نوع یافته",
  journal_entry_id: "شناسه سند حسابداری",
  metric_code: "شاخص مالی",
  position: "جایگاه دوره",
  reason_parameters: "پارامترهای دلیل",
  transaction_id: "شناسه تراکنش",
  value_irr: "مبلغ",
};

const idPattern = /(^id$|_id$|^[0-9a-f]{8}-)/i;
const numericPattern = /^-?\d+(\.\d+)?$/;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function faDate(value: string | null | undefined) {
  if (!value) return "—";
  return toJalaliDate(value);
}

function faDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return toJalaliDateTime(value);
}

function money(value: string | null) {
  if (value == null) return "موجود نیست";
  try {
    return new Intl.NumberFormat("fa-IR").format(BigInt(value));
  } catch {
    return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(
      Number(value),
    );
  }
}

function percent(value: string | null) {
  if (value == null) return "موجود نیست";
  return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(Number(value) * 100)}٪`;
}

function displayValue(value: unknown) {
  if (value == null || value === "") return "موجود نیست";
  if (typeof value === "boolean") return value ? "بله" : "خیر";
  if (typeof value === "object") return JSON.stringify(value);
  if (numericPattern.test(String(value)))
    return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 4 }).format(
      Number(value),
    );
  return String(value);
}

function shortId(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function FindingCaseWorkspace({
  company,
  currentUserId,
  findingId,
}: {
  company: Company;
  currentUserId: string;
  findingId: string;
}) {
  const [finding, setFinding] = useState<Finding | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewTimelineItem[]>([]);
  const [reviewCursor, setReviewCursor] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // Phase 3 Action Modals State
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [assignNote, setAssignNote] = useState<string>("");
  const [submittingAssign, setSubmittingAssign] = useState(false);

  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolutionType, setResolutionType] = useState<string>("reconciled");
  const [resolutionNote, setResolutionNote] = useState<string>("");
  const [submittingResolve, setSubmittingResolve] = useState(false);

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verificationNote, setVerificationNote] = useState<string>("");
  const [submittingVerify, setSubmittingVerify] = useState(false);

  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState<string>("");
  const [submittingReopen, setSubmittingReopen] = useState(false);

  const [dismissOpen, setDismissOpen] = useState(false);
  const [dismissReason, setDismissReason] = useState<string>("");
  const [submittingDismiss, setSubmittingDismiss] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [findingResult, evidenceResult, reviewsResult, membersResult] =
          await Promise.all([
            api<Finding>(`/companies/${company.id}/findings/${findingId}`),
            api<EvidenceItemsResponse>(
              `/companies/${company.id}/findings/${findingId}/evidence`,
            ),
            api<ReviewTimelineResponse>(
              `/companies/${company.id}/findings/${findingId}/reviews?limit=50`,
            ),
            api<Member[]>(`/companies/${company.id}/members`),
          ]);
        if (!ignore) {
          setFinding({
            ...findingResult,
            assignee_name:
              findingResult.assigned_to_name ?? findingResult.assignee_name,
            resolver_name:
              findingResult.resolved_by_name ?? findingResult.resolver_name,
            verifier_name:
              findingResult.verified_by_name ?? findingResult.verifier_name,
          });
          setEvidence(evidenceResult.items);
          setReviewItems(reviewsResult.items);
          setReviewCursor(reviewsResult.next_cursor);
          setMembers(membersResult);
        }
      } catch (caught) {
        if (!ignore)
          setError(
            caught instanceof Error
              ? caught.message
              : "پرونده یافته دریافت نشد.",
          );
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [company.id, findingId]);

  const reloadReview = useCallback(async () => {
    const [findingResult, reviewsResult] = await Promise.all([
      api<Finding>(`/companies/${company.id}/findings/${findingId}`),
      api<ReviewTimelineResponse>(
        `/companies/${company.id}/findings/${findingId}/reviews?limit=50`,
      ),
    ]);
    setFinding({
      ...findingResult,
      assignee_name:
        findingResult.assigned_to_name ?? findingResult.assignee_name,
      resolver_name:
        findingResult.resolved_by_name ?? findingResult.resolver_name,
      verifier_name:
        findingResult.verified_by_name ?? findingResult.verifier_name,
    });
    setReviewItems(reviewsResult.items);
    setReviewCursor(reviewsResult.next_cursor);
  }, [company.id, findingId]);

  const loadMoreReviews = useCallback(async () => {
    if (!reviewCursor) return;
    const result = await api<ReviewTimelineResponse>(
      `/companies/${company.id}/findings/${findingId}/reviews?limit=50&cursor=${reviewCursor}`,
    );
    setReviewItems((current) => [...current, ...result.items]);
    setReviewCursor(result.next_cursor);
  }, [company.id, findingId, reviewCursor]);

  const isResolver = Boolean(
    finding?.resolved_by_user_id &&
      finding.resolved_by_user_id === currentUserId,
  );
  const canVerifyRole =
    company.role === "owner" || company.role === "finance_manager";
  const canVerify = canVerifyRole && !isResolver;
  const isResolved =
    finding?.workflow_status === "resolved" ||
    (finding as any)?.status === "resolved";
  const isVerified = (finding as any)?.status === "verified";
  const canAct = company.role !== "viewer";

  const handleAssign = async () => {
    if (!selectedAssignee || submittingAssign) return;
    setSubmittingAssign(true);
    try {
      await api(`/companies/${company.id}/findings/${findingId}/assign`, {
        method: "POST",
        body: JSON.stringify({
          assigned_to_user_id: selectedAssignee,
          due_date: dueDate || null,
          note: assignNote || null,
        }),
      });
      toast.success("مغایرت با موفقیت ارجاع داده شد.");
      setAssignOpen(false);
      await reloadReview();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا در ارجاع مغایرت.");
    } finally {
      setSubmittingAssign(false);
    }
  };

  const handleResolve = async () => {
    if (resolutionNote.trim().length < 5 || submittingResolve) return;
    setSubmittingResolve(true);
    try {
      await api(`/companies/${company.id}/findings/${findingId}/resolve`, {
        method: "POST",
        body: JSON.stringify({
          resolution_type: resolutionType,
          resolution_note: resolutionNote,
        }),
      });
      toast.success(
        "حل‌وفصل مغایرت ثبت شد و پرونده به صف تایید دو امضایی (Maker-Checker) ارسال گردید.",
      );
      setResolveOpen(false);
      await reloadReview();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "خطا در حل‌وفصل مغایرت.",
      );
    } finally {
      setSubmittingResolve(false);
    }
  };

  const handleVerify = async () => {
    if (!canVerify || submittingVerify) return;
    setSubmittingVerify(true);
    try {
      await api(`/companies/${company.id}/findings/${findingId}/verify`, {
        method: "POST",
        body: JSON.stringify({
          verification_note: verificationNote || null,
        }),
      });
      toast.success(
        "تایید نهایی دو امضایی با موفقیت انجام شد و پرونده به صورت قطعی بسته گردید.",
      );
      setVerifyOpen(false);
      await reloadReview();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا در تایید پرونده.");
    } finally {
      setSubmittingVerify(false);
    }
  };

  const handleReopen = async () => {
    if (reopenReason.trim().length < 5 || submittingReopen) return;
    setSubmittingReopen(true);
    try {
      await api(`/companies/${company.id}/findings/${findingId}/reopen`, {
        method: "POST",
        body: JSON.stringify({ reason: reopenReason }),
      });
      toast.success("پرونده با موفقیت بازگشایی شد.");
      setReopenOpen(false);
      await reloadReview();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "خطا در بازگشایی پرونده.",
      );
    } finally {
      setSubmittingReopen(false);
    }
  };

  const handleDismiss = async () => {
    if (dismissReason.trim().length < 5 || submittingDismiss) return;
    setSubmittingDismiss(true);
    try {
      await api(`/companies/${company.id}/findings/${findingId}/dismiss`, {
        method: "POST",
        body: JSON.stringify({ reason: dismissReason }),
      });
      toast.success("پرونده با موفقیت رد شد.");
      setDismissOpen(false);
      await reloadReview();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطا در رد پرونده.");
    } finally {
      setSubmittingDismiss(false);
    }
  };

  const evidenceKinds = useMemo(
    () => new Set(evidence.map((item) => item.evidence_type)),
    [evidence],
  );

  if (loading)
    return (
      <FindingCaseSkeleton
        companyId={company.id}
        findingId={findingId}
        title={getFindingTitle(company.id, findingId)}
      />
    );
  if (!finding || error) {
    return (
      <section className="finding-case-error py-12 text-center flex flex-col items-center justify-center space-y-3">
        <Icon name="alert" className="size-8 text-destructive" />
        <div>
          <h2 className="text-base font-bold text-foreground">
            پرونده یافته در دسترس نیست
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {error || "این یافته پیدا نشد."}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="mt-2">
          <Link href={`/companies/${company.id}/findings`}>
            بازگشت به یافته‌ها
          </Link>
        </Button>
      </section>
    );
  }

  const factorEntries = (
    Object.keys(factorLabels) as (keyof typeof factorLabels)[]
  ).map((key) => [key, finding.priority_explanation.factors?.[key]] as const);
  const evidenceComplete =
    evidenceKinds.has("rule") &&
    evidenceKinds.has("calculation") &&
    (evidenceKinds.has("source_record") || evidenceKinds.has("comparison"));

  return (
    <div className="pp-page pp-case finding-case-workspace space-y-6">
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onClick={() => {
          if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
          } else {
            router.push(`/companies/${company.id}/findings`);
          }
        }}
        className="case-back inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <ChevronRight className="size-3.5" />
        <span>بازگشت به صف یافته‌ها</span>
      </Button>

      {/* Hero Header */}
      <section className="finding-case-hero p-6 sm:p-8 rounded-[var(--ds-card-radius)] border border-border bg-card shadow-[var(--ds-shadow-sm)] grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6 items-center">
        <div className="case-hero-copy space-y-3">
          <div className="case-badges flex flex-wrap items-center gap-2 text-xs">
            <Badge
              variant="outline"
              className={`priority-band ${bandBadgeClasses[finding.priority_band]}`}
            >
              {bandLabels[finding.priority_band]}
            </Badge>
            <span className="inline-flex items-center gap-1 text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-lg">
              <Icon
                name={
                  finding.assertion_status === "hypothesis" ? "alert" : "check"
                }
                className="size-3.5 text-primary"
              />
              {assertionLabels[finding.assertion_status]}
            </span>
            <span className="text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-lg">
              {workflowLabels[finding.workflow_status]}
            </span>
          </div>

          <FindingTitleTransition
            companyId={company.id}
            findingId={finding.id}
            title={finding.title_fa}
            as="h2"
            className="text-xl sm:text-2xl font-bold text-foreground tracking-normal"
          />
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {finding.summary_fa}
          </p>

          <div className="claim-boundary flex items-start gap-2.5 p-3 rounded-[var(--ds-card-radius)] bg-muted/40 border border-border text-xs text-muted-foreground">
            <Icon
              name={
                finding.assertion_status === "hypothesis" ? "alert" : "shield"
              }
              className="size-4 text-primary shrink-0 mt-0.5"
            />
            <p>
              <strong className="font-bold text-foreground">حد ادعا: </strong>
              {finding.assertion_status === "hypothesis"
                ? "این مورد نشانهٔ نیازمند بررسی است و به‌تنهایی اثبات نمی‌کند تراکنش واقعاً ثبت نشده است."
                : "این نتیجه مستقیماً از قاعده و دادهٔ ثبت‌شده به دست آمده است."}
            </p>
          </div>
        </div>

        <div className="case-score flex flex-col items-center justify-center p-4 rounded-[var(--ds-card-radius)] bg-muted/30 border border-border text-center space-y-1">
          <div className="text-3xl font-bold font-mono text-foreground">
            {new Intl.NumberFormat("fa-IR", {
              maximumFractionDigits: 0,
            }).format(Number(finding.priority_score))}
            <small className="text-xs text-muted-foreground font-normal mr-1">
              / ۱۰۰
            </small>
          </div>
          <p className="text-xs text-muted-foreground">
            اولویت{" "}
            <strong className="text-foreground">
              {bandLabels[finding.priority_band]}
            </strong>
          </p>
          <span className="text-[11px] text-muted-foreground">
            اطمینان{" "}
            {new Intl.NumberFormat("fa-IR", {
              maximumFractionDigits: 0,
            }).format(Number(finding.confidence_score))}
            ٪
          </span>
        </div>
      </section>

      {/* Integrity Bar */}
      <ProductCard
        className="case-integrity p-4 rounded-[var(--ds-card-radius)] border border-border bg-card grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-muted-foreground"
        aria-label="وضعیت قابلیت حسابرسی"
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${evidenceComplete ? " text-ds-success" : " text-ds-warning"}`}
          >
            <Icon
              name={evidenceComplete ? "check" : "alert"}
              className="size-3.5"
            />
          </span>
          <div>
            <strong className="block text-foreground">
              {evidenceComplete
                ? "زنجیره شواهد کامل است"
                : "زنجیره شواهد محدود است"}
            </strong>
            <small className="block text-[11px]">
              قاعده، محاسبه و منبع بررسی شدند
            </small>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Icon name="shield" className="size-5 text-primary shrink-0" />
          <div>
            <strong className="block text-foreground">خروجی تغییرناپذیر</strong>
            <small className="block text-[11px]">
              نسخه‌های قواعد و مدل اولویت ثبت شده‌اند
            </small>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Icon name="calendar" className="size-5 text-primary shrink-0" />
          <div>
            <strong className="block text-foreground">
              {faDate(finding.period_start)} تا {faDate(finding.period_end)}
            </strong>
            <small className="block text-[11px]">دوره مورد بررسی</small>
          </div>
        </div>
      </ProductCard>

      {/* Financial Control & Maker-Checker Action Center */}
      <section
        className="p-5 sm:p-6 rounded-[var(--ds-card-radius)] border border-border bg-card shadow-xs space-y-5"
        aria-labelledby="governance-center-title"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <span className="text-xs font-bold text-primary">
                چرخه اقدام و حاکمیت مالی
              </span>
            </div>
            <h3
              id="governance-center-title"
              className="text-base sm:text-lg font-bold text-foreground"
            >
              مدیریت اقدام، حل‌وفصل و تایید دو امضایی (Maker-Checker)
            </h3>
          </div>

          {/* Quick Action Buttons */}
          {canAct && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAssignOpen(true)}
                className="gap-1.5"
              >
                <UserPlus className="size-3.5 text-primary" />
                <span>ارجاع وظیفه</span>
              </Button>

              {!isResolved && !isVerified && (
                <Button
                  size="sm"
                  variant="success-subtle"
                  onClick={() => setResolveOpen(true)}
                  className="gap-1.5"
                >
                  <CheckCircle2 className="size-3.5 text-ds-success" />
                  <span>حل‌وفصل مغایرت</span>
                </Button>
              )}

              {/* Verify Button (Maker-Checker) */}
              <div className="relative group">
                <Button
                  size="sm"
                  disabled={
                    !isResolved || isVerified || isResolver || !canVerifyRole
                  }
                  onClick={() => setVerifyOpen(true)}
                  className={`h-8 gap-1.5 text-xs font-bold rounded-[var(--ds-card-radius)] ${
                    isResolver
                      ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground"
                      : "bg-ds-success hover:bg-ds-success text-white shadow-xs"
                  }`}
                >
                  <FileCheck2 className="size-3.5" />
                  <span>تایید نهایی (Maker-Checker)</span>
                </Button>
                {isResolver && (
                  <div className="absolute bottom-full mb-1.5 hidden group-hover:block z-30 w-64 p-2 rounded-lg bg-popover text-foreground border border-border shadow-lg text-[11px] leading-tight text-center">
                    شما ثبت‌کننده حل این پرونده هستید و طبق قانون تفکیک وظایف
                    مجاز به تایید خود نیستید.
                  </div>
                )}
              </div>

              {(isResolved || isVerified) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReopenOpen(true)}
                  className="gap-1.5 border-ds-warning/30 text-ds-warning hover:bg-ds-warning/10"
                >
                  <RotateCcw className="size-3.5 text-ds-warning" />
                  <span>بازگشایی مجدد</span>
                </Button>
              )}

              {!isVerified && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDismissOpen(true)}
                  className="gap-1 text-muted-foreground hover:text-destructive"
                >
                  <XCircle className="size-3.5" />
                  <span>رد یافته</span>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Maker-Checker & Governance Status Alerts */}
        {isResolver && (
          <div className="p-3.5 rounded-[var(--ds-card-radius)] border border-ds-warning/30 bg-ds-warning/10 text-ds-warning text-xs flex items-start gap-2.5">
            <AlertCircle className="size-5 text-ds-warning shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">
                اصل تفکیک وظایف (Maker-Checker Principle):
              </strong>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                شما ثبت‌کننده راه‌حل این پرونده بوده‌اید. جهت رعایت کنترل‌های
                داخلی و جلوگیری از تضاد منافع، تایید نهایی و بسته‌شدن قطعی
                پرونده منحصراً باید توسط مدیر مالی یا مالک دیگری انجام گیرد.
              </p>
            </div>
          </div>
        )}

        {finding.verified_by_user_id && (
          <div className="p-3.5 rounded-[var(--ds-card-radius)] border border-ds-success/30 bg-ds-success/10 text-ds-success text-xs flex items-start gap-2.5">
            <CheckCircle2 className="size-5 text-ds-success shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">
                تایید نهایی دو امضایی توسط{" "}
                {finding.verifier_name || "مدیر مالی"} در تاریخ{" "}
                {faDateTime(finding.verified_at || "")}
              </strong>
              {finding.verification_note && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  یادداشت تایید: «{finding.verification_note}»
                </p>
              )}
            </div>
          </div>
        )}

        {isResolved && !finding.verified_by_user_id && !isResolver && (
          <div className="p-3.5 rounded-[var(--ds-card-radius)] border border-primary/30 bg-primary/10 text-primary text-xs flex items-start gap-2.5">
            <Clock className="size-5 text-primary shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">
                پرونده حل‌شده و در انتظار تایید نهایی (Maker-Checker) است.
              </strong>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                روش حل: {finding.resolution_type || "ثبت‌شده"} • یادداشت: «
                {finding.resolution_note || "—"}» • اقدام‌کننده:{" "}
                {finding.resolver_name || "همکار"}
              </p>
            </div>
          </div>
        )}

        {/* Financial Governance Context Meta */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-1">
          <div className="p-3 rounded-[var(--ds-card-radius)] border border-border/70 bg-muted/20">
            <span className="text-[10px] text-muted-foreground block">
              مسئول پیگیری:
            </span>
            <strong className="text-foreground text-xs mt-0.5 block truncate">
              {finding.assignee_name || "تخصیص نیافته"}
            </strong>
          </div>

          <div className="p-3 rounded-[var(--ds-card-radius)] border border-border/70 bg-muted/20">
            <span className="text-[10px] text-muted-foreground block">
              موعد اقدام (Due Date):
            </span>
            <strong className="text-foreground text-xs mt-0.5 block font-mono">
              {finding.due_date ? faDate(finding.due_date) : "تعیین نشده"}
            </strong>
          </div>

          <div className="p-3 rounded-[var(--ds-card-radius)] border border-border/70 bg-muted/20">
            <span className="text-[10px] text-muted-foreground block">
              مبلغ درگیر در مغایرت:
            </span>
            <div className="mt-0.5">
              <MoneyDisplay
                amount={
                  finding.affected_amount_irr ||
                  (finding as any).financial_impact_irr ||
                  0
                }
                currency="ریال"
                size="sm"
                className="font-bold text-foreground"
              />
            </div>
          </div>

          <div className="p-3 rounded-[var(--ds-card-radius)] border border-border/70 bg-muted/20">
            <span className="text-[10px] text-muted-foreground block">
              دفعات بازگشایی:
            </span>
            <strong className="text-foreground text-xs mt-0.5 block font-mono">
              {toPersianDigits(finding.reopened_count || 0)} بار
            </strong>
          </div>
        </div>
      </section>

      {/* Assign Modal */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <UserPlus className="size-5 text-primary" />
              <span>ارجاع مغایرت به همکار</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              مسئول پیگیری و موعد نهایی اقدام را برای این پرونده تعیین نمایید.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2 text-xs">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                انتخاب عضو تیم مالی:
              </label>
              <Select
                value={selectedAssignee}
                onValueChange={setSelectedAssignee}
                dir="rtl"
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="یک نفر را انتخاب کنید..." />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.full_name} ({m.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="finding-action-due-date" className="text-xs font-bold text-foreground">
                موعد اقدام (اختیاری):
              </label>
              <PersianDatePicker
                id="finding-action-due-date"
                aria-label="موعد اقدام"
                size="sm"
                value={dueDate}
                onValueChange={setDueDate}
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                یادداشت ارجاع:
              </label>
              <Input
                size="sm"
                placeholder="توضیح یا دستور کار برای همکار..."
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              disabled={!selectedAssignee || submittingAssign}
              onClick={() => void handleAssign()}
              className=""
            >
              {submittingAssign ? (
                <RefreshCcw className="size-3.5 animate-spin ms-1" />
              ) : null}
              ثبت ارجاع
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAssignOpen(false)}
              className=""
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Modal */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="max-w-md p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="size-5 text-ds-success" />
              <span>حل‌وفصل پرونده مغایرت</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              شیوه حل‌وفصل و شرح اقدام انجام‌شده را ثبت نمایید. این اقدام پرونده
              را به صف Maker-Checker ارسال می‌کند.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2 text-xs">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                نوع راه‌حل (Resolution Type):
              </label>
              <Select
                value={resolutionType}
                onValueChange={setResolutionType}
                dir="rtl"
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reconciled">
                    تطبیق بانکی انجام شد (Reconciled)
                  </SelectItem>
                  <SelectItem value="accounting_adjusted">
                    سند اصلاحی حسابداری صادر گردید (Adjusted)
                  </SelectItem>
                  <SelectItem value="bank_clarified">
                    استعلام بانکی اخذ و شفاف‌سازی شد (Clarified)
                  </SelectItem>
                  <SelectItem value="written_off">
                    سوخت بدهی یا بخشودگی مصوب شد (Written Off)
                  </SelectItem>
                  <SelectItem value="false_positive">
                    کشف نادرست / ناهنجاری ظاهری (False Positive)
                  </SelectItem>
                  <SelectItem value="policy_exception">
                    معافیت با تایید هیئت‌مدیره (Policy Exception)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                شرح راه‌حل (حداقل ۵ کاراکتر الزامی):
              </label>
              <Textarea
                rows={3}
                placeholder="توضیح دهید چه اقدامی جهت رفع این مغایرت انجام شده است..."
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              variant="success"
              type="button"
              disabled={resolutionNote.trim().length < 5 || submittingResolve}
              onClick={() => void handleResolve()}
              className=""
            >
              {submittingResolve ? (
                <RefreshCcw className="size-3.5 animate-spin ms-1" />
              ) : null}
              ثبت حل‌وفصل
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResolveOpen(false)}
              className=""
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verify Modal (Maker-Checker) */}
      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="max-w-md p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <FileCheck2 className="size-5 text-ds-success" />
              <span>تایید نهایی دو امضایی (Maker-Checker Verification)</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              با تایید شما به عنوان مدیر مالی یا مالک شرکت، راه‌حل ثبت‌شده
              صحه‌گذاری شده و پرونده به صورت قطعی بسته می‌شود.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3 rounded-[var(--ds-card-radius)] border border-border bg-muted/30 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  اقدام‌کننده اولیه:
                </span>
                <span className="font-bold text-foreground">
                  {finding.resolver_name || "کاربر سامانه"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">نوع راه‌حل:</span>
                <span className="font-bold text-foreground">
                  {finding.resolution_type}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                «{finding.resolution_note}»
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                یادداشت تایید (اختیاری):
              </label>
              <Input
                size="sm"
                placeholder="توضیحات تکمیلی یا تاییدیه حسابرسی..."
                value={verificationNote}
                onChange={(e) => setVerificationNote(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              variant="success"
              type="button"
              disabled={submittingVerify}
              onClick={() => void handleVerify()}
              className=""
            >
              {submittingVerify ? (
                <RefreshCcw className="size-3.5 animate-spin ms-1" />
              ) : null}
              تایید قطعی و بستن پرونده
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setVerifyOpen(false)}
              className=""
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Modal */}
      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent className="max-w-md p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <RotateCcw className="size-5 text-ds-warning" />
              <span>بازگشایی مجدد مغایرت</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              در صورت بروز شواهد جدید یا عدم صحت راه‌حل قبلی، دلیل بازگشایی را
              ثبت کنید تا پرونده مجدداً فعال گردد.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                دلیل بازگشایی (الزامی):
              </label>
              <Textarea
                rows={3}
                placeholder="حداقل ۵ کاراکتر در خصوص علت بازگشایی بنویسید..."
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              disabled={reopenReason.trim().length < 5 || submittingReopen}
              onClick={() => void handleReopen()}
              className="bg-ds-warning hover:bg-ds-warning"
            >
              {submittingReopen ? (
                <RefreshCcw className="size-3.5 animate-spin ms-1" />
              ) : null}
              تایید بازگشایی
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReopenOpen(false)}
              className=""
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dismiss Modal */}
      <Dialog open={dismissOpen} onOpenChange={setDismissOpen}>
        <DialogContent className="max-w-md p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <XCircle className="size-5 text-ds-danger" />
              <span>رد مغایرت یا یافته</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              با رد این یافته، پرونده از اولویت‌های فعال خارج می‌گردد. دلیل رد
              در تاریخچه حسابرسی ثبت خواهد شد.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                دلیل رد یافته (الزامی):
              </label>
              <Textarea
                rows={3}
                placeholder="حداقل ۵ کاراکتر در خصوص علت رد این مغایرت بنویسید..."
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              variant="destructive"
              disabled={dismissReason.trim().length < 5 || submittingDismiss}
              onClick={() => void handleDismiss()}
              className=""
            >
              {submittingDismiss ? (
                <RefreshCcw className="size-3.5 animate-spin ms-1" />
              ) : null}
              تایید رد یافته
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDismissOpen(false)}
              className=""
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Layer 2: Accounting & Bank Evidence */}
      <ProductCard
        className="case-evidence-panel p-6 rounded-[var(--ds-card-radius)] border border-border bg-card space-y-4 shadow-xs"
        aria-labelledby="case-evidence-title"
      >
        <header className="flex items-center justify-between border-b border-border/60 pb-3">
          <div>
            <h3
              id="case-evidence-title"
              className="text-base font-bold text-foreground"
            >
              زنجیره شواهد و مستندات (دفاتر حسابداری و صورتحساب بانک)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              مستندات ثبت‌شده در دفاتر، رکوردهای بانکی و محاسبات موید این مغایرت
            </p>
          </div>
          <span className="text-xs font-mono text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-lg">
            {toPersianDigits(evidence.length)} قطعه شاهد
          </span>
        </header>

        <ol className="case-evidence-list space-y-3">
          {evidence.map((item) => (
            <EvidenceCaseItem
              key={item.id}
              companyId={company.id}
              item={item}
            />
          ))}
        </ol>
      </ProductCard>

      {/* Layer 3: Audit History & Activity Log */}
      <FindingReviewPanel
        company={company}
        currentUserId={currentUserId}
        findingId={finding.id}
        currentStatus={finding.workflow_status}
        items={reviewItems}
        members={members}
        nextCursor={reviewCursor}
        onChanged={reloadReview}
        onLoadMore={loadMoreReviews}
      />

      {/* Layer 4: Technical Details & Audit Metadata (Collapsible) */}
      <div className="rounded-[var(--ds-card-radius)] border border-border bg-card shadow-xs overflow-hidden">
        <Button
          variant="surface"
          size="auto"
          motion="none"
          type="button"
          onClick={() => setShowTechnicalDetails((prev) => !prev)}
          className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-muted/20 transition-colors text-start cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Layers className="size-4 text-primary" />
            <div>
              <span className="text-sm font-bold text-foreground block">
                جزئیات فنی، فرمول اولویت و شناسه‌های سیستمی
              </span>
              <span className="text-xs text-muted-foreground block">
                مشاهده وزن عوامل، مرزهای اولویت، مدل ریاضی و شناسه‌های
                تغییرناپذیر
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{showTechnicalDetails ? "بستن جزئیات" : "نمایش جزئیات"}</span>
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                showTechnicalDetails && "rotate-180",
              )}
            />
          </div>
        </Button>

        {showTechnicalDetails && (
          <div className="p-5 sm:p-6 border-t border-border space-y-6 bg-muted/10">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
              {/* Priority Audit */}
              <div className="case-priority-panel p-5 rounded-[var(--ds-card-radius)] border border-border bg-card space-y-4">
                <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/60 pb-3">
                  <h4 className="text-sm font-bold text-foreground">
                    تحلیل عوامل و فرمول اولویت‌بندی
                  </h4>
                  <code
                    dir="ltr"
                    className="px-2 py-1 rounded bg-muted text-xs font-mono self-start sm:self-center"
                  >
                    {finding.priority_explanation.formula}
                  </code>
                </header>

                <div className="case-factor-list space-y-3">
                  {factorEntries.map(([key, factor]) => {
                    const score = Number(factor?.score ?? 0);
                    return (
                      <article
                        key={key}
                        className="p-3 rounded-[var(--ds-card-radius)] border border-border/60 bg-muted/20 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-foreground">
                            {factorLabels[key]}
                          </span>
                          <strong className="font-mono text-primary">
                            {toPersianDigits(
                              Number(factor?.weighted_score ?? 0).toFixed(2),
                            )}
                          </strong>
                        </div>
                        <Progress
                          className="h-1.5"
                          value={Math.max(0, Math.min(100, score))}
                        />
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>
                            امتیاز: {toPersianDigits(score.toFixed(2))}
                          </span>
                          <span>
                            وزن: {percent(String(factor?.weight ?? 0))}
                          </span>
                        </div>
                        {factor?.reasons_fa?.length ? (
                          <ul className="text-[11px] text-muted-foreground space-y-0.5 border-t border-border/40 pt-1.5 list-disc list-inside">
                            {factor.reasons_fa.map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        ) : null}
                      </article>
                    );
                  })}
                </div>

                {finding.priority_explanation.uncertainty_fa && (
                  <p className="priority-uncertainty flex items-center gap-2 p-3 rounded-[var(--ds-card-radius)] bg-ds-warning/10 text-ds-warning text-xs">
                    <AlertCircle className="size-4 shrink-0 text-ds-warning" />
                    {finding.priority_explanation.uncertainty_fa}
                  </p>
                )}
              </div>

              {/* Sidebar metadata */}
              <div className="space-y-4">
                <section className="p-4 rounded-[var(--ds-card-radius)] border border-border bg-card space-y-3">
                  <h4 className="text-xs font-bold text-foreground border-b border-border/60 pb-2">
                    مشخصات فنی پرونده
                  </h4>
                  <dl className="divide-y divide-border/60 text-xs">
                    <Fact
                      label="اثر مالی"
                      value={`${money(finding.affected_amount_irr)}${finding.affected_amount_irr ? " ریال" : ""}`}
                    />
                    <Fact
                      label="نسبت اثر به درآمد"
                      value={percent(finding.affected_ratio)}
                    />
                    <Fact
                      label="نوع یافته"
                      value={finding.finding_code}
                      latin
                    />
                    <Fact label="دلیل" value={finding.reason_code} latin />
                    <Fact
                      label="مدل اولویت"
                      value={finding.priority_model_version}
                      latin
                    />
                    <Fact
                      label="قاعده یافته"
                      value={finding.rule_version}
                      latin
                    />
                    <Fact label="شناسه یافته" value={finding.id} latin copy />
                    <Fact
                      label="شناسه اجرا"
                      value={finding.generation_run_id}
                      latin
                      copy
                    />
                    <Fact
                      label="زمان ثبت"
                      value={faDateTime(finding.created_at)}
                    />
                  </dl>
                </section>

                <div className="p-4 rounded-[var(--ds-card-radius)] border border-border bg-card space-y-2 text-xs">
                  <h4 className="font-bold text-foreground">
                    مرزهای اولویت این اجرا
                  </h4>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    این مرزها همراه یافته ثبت شده‌اند و تغییر تنظیمات روی این
                    پرونده اثر نمی‌گذارد.
                  </p>
                  <div className="flex flex-col gap-1 text-[11px] pt-1">
                    <span>
                      بحرانی از:{" "}
                      <b className="font-mono text-foreground">
                        {toPersianDigits(
                          displayValue(
                            record(finding.priority_config.bands).critical,
                          ),
                        )}
                      </b>
                    </span>
                    <span>
                      بالا از:{" "}
                      <b className="font-mono text-foreground">
                        {toPersianDigits(
                          displayValue(
                            record(finding.priority_config.bands).high,
                          ),
                        )}
                      </b>
                    </span>
                    <span>
                      متوسط از:{" "}
                      <b className="font-mono text-foreground">
                        {toPersianDigits(
                          displayValue(
                            record(finding.priority_config.bands).medium,
                          ),
                        )}
                      </b>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  latin = false,
  copy = false,
}: {
  label: string;
  value: string;
  latin?: boolean;
  copy?: boolean;
}) {
  const shown = copy ? shortId(value) : value;
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        dir={latin ? "ltr" : undefined}
        title={copy ? value : undefined}
        className="font-mono font-medium text-foreground text-end"
      >
        {shown}
      </dd>
    </div>
  );
}

function EvidenceCaseItem({
  companyId,
  item,
}: {
  companyId: string;
  item: EvidenceItem;
}) {
  const snapshot = record(item.field_snapshot);
  const raw = record(snapshot.raw);
  const normalized = record(snapshot.normalized);
  const sourceFile = record(snapshot.source_file);
  const sourceLocation = record(snapshot.source_location);
  const mainValues = Object.keys(item.calculation).length
    ? item.calculation
    : Object.fromEntries(
        Object.entries(snapshot).filter(
          ([key]) =>
            !["raw", "normalized", "source_file", "source_location"].includes(
              key,
            ),
        ),
      );

  return (
    <li className="flex items-start gap-3 p-4 rounded-[var(--ds-card-radius)] border border-border/60 bg-muted/20 text-xs">
      <span className="size-8 rounded-lg  text-primary flex items-center justify-center shrink-0 mt-0.5">
        <Icon
          name={
            item.evidence_type === "source_record"
              ? "file"
              : item.evidence_type === "rule"
                ? "target"
                : "evidence"
          }
          className="size-4"
        />
      </span>

      <article className="flex-1 space-y-3 min-w-0">
        <header className="flex items-center justify-between border-b border-border/40 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono">
              مرحله {new Intl.NumberFormat("fa-IR").format(item.ordinal)}
            </span>
            <h4 className="font-bold text-foreground">
              {evidenceLabels[item.evidence_type]}
            </h4>
          </div>
          <code
            dir="ltr"
            className="px-2 py-0.5 rounded bg-muted text-[11px] font-mono"
          >
            {item.rule_code ?? item.claim_code}
          </code>
        </header>

        {Object.keys(mainValues).length ? (
          <KeyValueGrid values={mainValues} />
        ) : null}

        {Object.keys(raw).length || Object.keys(normalized).length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
            {Object.keys(raw).length ? (
              <DataColumn title="مقدار ثبت‌شده در فایل" values={raw} />
            ) : null}
            {Object.keys(normalized).length ? (
              <DataColumn title="ارجاع نرمال‌شده" values={normalized} />
            ) : null}
          </div>
        ) : null}

        {item.source_file_id ? (
          <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-card border border-border/60">
            <div className="flex items-center gap-2 min-w-0">
              <Icon
                name="file"
                className="size-4 text-muted-foreground shrink-0"
              />
              <div className="min-w-0">
                <strong className="block truncate text-foreground">
                  {String(sourceFile.original_name ?? "فایل ورودی")}
                </strong>
                <small className="block text-[10px] text-muted-foreground">
                  {sourceLocation.sheet
                    ? `شیت ${String(sourceLocation.sheet)} · `
                    : ""}
                  {sourceLocation.row_number
                    ? `ردیف ${Number(sourceLocation.row_number).toLocaleString("fa-IR")}`
                    : ""}
                </small>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="gap-1">
              <a
                href={`${API_URL}/companies/${companyId}/imports/source-files/${item.source_file_id}/download`}
              >
                <Icon name="download" className="size-3" />
                دریافت فایل
              </a>
            </Button>
          </div>
        ) : null}

        {sourceFile.sha256 ? (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 font-mono">
            <span>اثر انگشت فایل:</span>
            <code dir="ltr">{String(sourceFile.sha256).slice(0, 16)}…</code>
          </p>
        ) : null}

        <footer className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/40 pt-2">
          <span>ثبت شاهد: {faDateTime(item.created_at)}</span>
          <span>
            نسخه: <code dir="ltr">{item.rule_version}</code>
          </span>
        </footer>
      </article>
    </li>
  );
}

function DataColumn({
  title,
  values,
}: {
  title: string;
  values: Record<string, unknown>;
}) {
  return (
    <section className="space-y-1.5">
      <h5 className="font-bold text-foreground text-[11px]">{title}</h5>
      <KeyValueGrid values={values} />
    </section>
  );
}

function KeyValueGrid({ values }: { values: Record<string, unknown> }) {
  return (
    <dl className="divide-y divide-border/40 text-[11px]">
      {Object.entries(values).map(([key, value]) => (
        <div key={key} className="flex items-center justify-between py-1">
          <dt className="text-muted-foreground">
            {fieldLabels[key] ?? key.replaceAll("_", " ")}
          </dt>
          <dd
            dir={
              idPattern.test(key) || idPattern.test(String(value))
                ? "ltr"
                : undefined
            }
            className="font-mono text-foreground font-medium text-end"
          >
            {displayValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FindingCaseSkeleton({
  companyId,
  findingId,
  title,
}: {
  companyId: string;
  findingId: string;
  title?: string;
}) {
  return (
    <div
      className="pp-page pp-case finding-case-skeleton space-y-4"
      aria-label="در حال دریافت پرونده یافته"
    >
      {title ? (
        <>
          <Skeleton className="h-9 w-40" />
          <section className="finding-case-hero">
            <div className="space-y-3">
              <Skeleton className="h-7 w-48" />
              <FindingTitleTransition
                companyId={companyId}
                findingId={findingId}
                title={title}
                as="h2"
                className="text-xl sm:text-2xl font-bold text-foreground tracking-normal"
              />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-8 w-full" />
            </div>
            <Skeleton className="h-28 w-full" />
          </section>
        </>
      ) : (
        <Skeleton className="h-32 w-full rounded-[var(--ds-card-radius)]" />
      )}
      <Skeleton className="h-16 w-full rounded-[var(--ds-card-radius)]" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <Skeleton className="h-96 rounded-[var(--ds-card-radius)]" />
        <Skeleton className="h-96 rounded-[var(--ds-card-radius)]" />
      </div>
    </div>
  );
}
