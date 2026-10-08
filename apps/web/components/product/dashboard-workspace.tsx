"use client";

import Link from "next/link";
import { DashboardControlSummary } from "./dashboard-control-summary";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  ChevronLeft,
  FileText,
  FileUp,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PageHeader,
  toPersianDigits,
  toJalaliDate,
} from "@/components/ui/financial";
import { ExecutiveCalculationPanel } from "./executive-calculation-panel";
import { api } from "@/lib/product-api";
import type {
  AnalysisRun,
  CashFlowSummaryResponse,
  Company,
  ExecutiveDashboardResponse,
  PayablesSummaryResponse,
  ReceivablesSummaryResponse,
  DashboardResponse,
} from "@/lib/product-types";
import { DashboardFindingsReview } from "./dashboard-findings-review";
import { SelectField, SelectOption } from "./select-field";

type WorkingCapital = {
  runwayDays: number | null;
  runwayStatus: string;
  dsoDays: number | null;
  dpoDays: number | null;
  cccDays: number | null;
  totalReceivables: string;
  totalPayables: string;
};

export function DashboardWorkspace({ company }: { company: Company }) {
  const [analyses, setAnalyses] = useState<AnalysisRun[]>([]);
  const [analysisId, setAnalysisId] = useState("");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [workingCapital, setWorkingCapital] = useState<{
    runwayDays: number | null;
    runwayStatus: string;
    dsoDays: number | null;
    dpoDays: number | null;
    cccDays: number | null;
    totalReceivables: string;
    totalPayables: string;
  } | null>(null);

  const [execDashboard, setExecDashboard] =
    useState<ExecutiveDashboardResponse | null>(null);
  const [loadingExec, setLoadingExec] = useState(false);
  const [capitalRevision, setCapitalRevision] = useState(0);

  const loadExecDashboard = useCallback(async () => {
    setLoadingExec(true);
    try {
      const res = await api<ExecutiveDashboardResponse>(
        `/companies/${company.id}/calculations/dashboard`,
      );
      setExecDashboard(res);
    } catch {
      setExecDashboard(null);
    } finally {
      setLoadingExec(false);
    }
  }, [company.id]);

  useEffect(() => {
    let ignore = false;
    async function loadWC() {
      try {
        const [cfRes, recRes, payRes] = await Promise.allSettled([
          api<CashFlowSummaryResponse>(
            `/companies/${company.id}/cashflow/summary`,
          ),
          api<ReceivablesSummaryResponse>(
            `/companies/${company.id}/receivables/summary`,
          ),
          api<PayablesSummaryResponse>(
            `/companies/${company.id}/payables/summary`,
          ),
        ]);

        if (ignore) return;

        const hasAny =
          cfRes.status === "fulfilled" ||
          recRes.status === "fulfilled" ||
          payRes.status === "fulfilled";
        if (!hasAny) {
          setWorkingCapital(null);
          return;
        }

        const runwayDays =
          cfRes.status === "fulfilled" ? cfRes.value.runway_days : null;
        const runwayStatus =
          cfRes.status === "fulfilled" ? cfRes.value.runway_status : "normal";
        const dsoDays =
          recRes.status === "fulfilled" ? recRes.value.dso_days : null;
        const dpoDays =
          payRes.status === "fulfilled" ? payRes.value.dpo_days : null;
        const cccDays =
          payRes.status === "fulfilled"
            ? payRes.value.ccc_days
            : dsoDays != null && dpoDays != null
              ? dsoDays - dpoDays
              : null;
        const totalReceivables =
          recRes.status === "fulfilled"
            ? recRes.value.total_receivables_irr
            : "0";
        const totalPayables =
          payRes.status === "fulfilled" ? payRes.value.total_payables_irr : "0";

        if (runwayDays == null && dsoDays == null && dpoDays == null) {
          setWorkingCapital(null);
          return;
        }

        setWorkingCapital({
          runwayDays,
          runwayStatus,
          dsoDays,
          dpoDays,
          cccDays,
          totalReceivables,
          totalPayables,
        });
      } catch {
        if (!ignore) {
          setWorkingCapital(null);
        }
      }
    }
    void loadWC();
    return () => {
      ignore = true;
    };
  }, [company.id, capitalRevision]);

  useEffect(() => { void loadExecDashboard(); }, [loadExecDashboard]);

  const refreshCurrentData = useCallback(async () => {
    await loadExecDashboard();
    setCapitalRevision((value) => value + 1);
  }, [loadExecDashboard]);

  const loadDashboard = useCallback(
    async (selectedId?: string) => {
      const query = new URLSearchParams({ top_limit: "5" });
      if (selectedId) query.set("analysis_run_id", selectedId);
      return api<DashboardResponse>(
        `/companies/${company.id}/dashboard?${query.toString()}`,
      );
    },
    [company.id],
  );

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      setLoading(true);
      setError("");
      const [runsResult, dashboardResult] = await Promise.allSettled([
        api<AnalysisRun[]>(`/companies/${company.id}/analysis-runs?limit=30`),
        loadDashboard(),
      ]);

      if (ignore) return;

      if (runsResult.status === "fulfilled") {
        setAnalyses(
          runsResult.value.filter(
            (item) =>
              item.status === "completed" ||
              item.status === "completed_limited",
          ),
        );
      }
      if (dashboardResult.status === "fulfilled") {
        setDashboard(dashboardResult.value);
        setAnalysisId(dashboardResult.value.snapshot.analysis_run_id);
      } else {
        const msg =
          dashboardResult.reason instanceof Error
            ? dashboardResult.reason.message
            : "";
        if (!msg.includes("snapshot") && !msg.includes("404")) {
          setError(msg || "داشبورد مالی هنوز برای این شرکت آماده نیست.");
        }
      }
      setLoading(false);
    }
    void bootstrap();
    return () => {
      ignore = true;
    };
  }, [company.id, loadDashboard, retry]);

  async function changeSnapshot(value: string) {
    setAnalysisId(value);
    setSwitching(true);
    setError("");
    try {
      setDashboard(await loadDashboard(value));
    } catch (caught) {
      setAnalysisId(dashboard?.snapshot.analysis_run_id ?? "");
      setError(
        caught instanceof Error
          ? caught.message
          : "تصویر تحلیلی این دوره بارگذاری نشد.",
      );
    } finally {
      setSwitching(false);
    }
  }

  if (loading) return <DashboardSkeleton />;

  if (!dashboard) {
    return (
      <div className="financial-dashboard" dir="rtl">
        <PageHeader
          title="داشبورد مالی"
        />
        {error ? (
          <div className="dashboard-error" role="alert">
            <AlertCircle size={22} />
            <div>
              <strong>داشبورد بارگذاری نشد</strong>
              <p>{error}</p>
            </div>
            <Button
              variant="outline"
              className="dashboard-button"
              onClick={() => setRetry((value) => value + 1)}
            >
              تلاش دوباره
            </Button>
          </div>
        ) : (
          <section className="dashboard-panel dashboard-onboarding">
            <FileUp size={36} />
            <h2>داشبورد را با داده‌های شرکت راه‌اندازی کنید</h2>
            <p>
              ابتدا اسناد مالی یا گردش بانک را بارگذاری کنید و سپس تحلیل دوره را
              اجرا کنید.
            </p>
            <ol>
              <li>
                <strong>بارگذاری اسناد و بانک</strong>
                <p>فایل اکسل یا CSV را وارد کنید و ستون‌ها را نگاشت کنید.</p>
                <Button asChild className="dashboard-button">
                  <Link href={`/companies/${company.id}/data`}>
                    بارگذاری داده‌ها
                    <ChevronLeft size={16} />
                  </Link>
                </Button>
              </li>
              <li>
                <strong>محاسبه و تحلیل دوره</strong>
                <p>
                  بازهٔ زمانی را انتخاب کنید تا شاخص‌ها و یافته‌ها محاسبه شوند.
                </p>
                <Button asChild variant="outline" className="dashboard-button">
                  <Link href={`/companies/${company.id}/reports/analysis`}>
                    رفتن به تحلیل مالی
                    <ChevronLeft size={16} />
                  </Link>
                </Button>
              </li>
            </ol>
          </section>
        )}
      </div>
    );
  }

  return (
    <DashboardContent
      dashboard={dashboard}
      switching={switching}
      analyses={analyses}
      analysisId={analysisId}
      changeSnapshot={changeSnapshot}
      error={error}
      workingCapital={workingCapital}
      company={company}
      execDashboard={execDashboard}
      onRefreshExec={refreshCurrentData}
      loadingExec={loadingExec}
    />
  );
}

function DashboardContent({
  dashboard,
  switching,
  analyses,
  analysisId,
  changeSnapshot,
  error,
  workingCapital,
  company,
  execDashboard,
  onRefreshExec,
  loadingExec,
}: {
  dashboard: DashboardResponse;
  switching: boolean;
  analyses: AnalysisRun[];
  analysisId: string;
  changeSnapshot: (id: string) => void;
  error: string;
  workingCapital: WorkingCapital | null;
  company: Company;
  execDashboard: ExecutiveDashboardResponse | null;
  onRefreshExec: () => Promise<void>;
  loadingExec: boolean;
}) {
  const { finding_summary: summary, top_findings: findings } = dashboard;
  const [now] = useState(() => Date.now());
  const age = dashboard.snapshot.completed_at
    ? Math.max(
        0,
        Math.floor(
          (now - new Date(dashboard.snapshot.completed_at).getTime()) /
            86400000,
        ),
      )
    : 0;
  const base = `/companies/${company.id}`;
  const comparisonRun = analyses.find((run) => run.id === dashboard.snapshot.comparison_analysis_run_id);
  const period = `${toJalaliDate(dashboard.snapshot.period_start)} تا ${toJalaliDate(dashboard.snapshot.period_end)}`;
  const periodSelector = (
    <div className="dashboard-period">
      <label htmlFor="dashboard-analysis-period">دورهٔ یافته‌ها</label>
      <SelectField id="dashboard-analysis-period" value={analysisId} disabled={switching}
        onChange={(event) => void changeSnapshot(event.target.value)}>
        {(analyses.length ? analyses : [{ id: dashboard.snapshot.analysis_run_id, ...dashboard.snapshot }]).map((run) => (
          <SelectOption key={run.id} value={run.id}>
            {toJalaliDate(run.period_start)} تا {toJalaliDate(run.period_end)}
          </SelectOption>
        ))}
      </SelectField>
    </div>
  );
  return (
    <div className="financial-dashboard" dir="rtl">
      <PageHeader
        title="داشبورد مالی"
        primaryAction={
          <Button asChild className="dashboard-button">
            <Link href={`${base}/actions`}>
              اقدامات
              <ArrowUpRight size={16} />
            </Link>
          </Button>
        }
        secondaryActions={
          <Button asChild variant="outline" className="dashboard-button">
            <Link href={`${base}/reports`}>
              <FileText size={16} />
              گزارش‌ها
            </Link>
          </Button>
        }
      />
      {age > 3 && <Link href={`${base}/data`} className="dashboard-stale">تحلیل {toPersianDigits(age)} روز قبل · ورود داده جدید <ChevronLeft size={14} /></Link>}
      {switching && (
        <p role="status" className="dashboard-loading-note">
          در حال بارگذاری یافته‌های دورهٔ انتخاب‌شده…
        </p>
      )}
      {error && (
        <div className="dashboard-error" role="alert">
          <AlertCircle size={20} />
          <p>{error}</p>
        </div>
      )}
      <DashboardControlSummary key={company.id} companyId={company.id} />
      <ExecutiveCalculationPanel
        reviewPanel={<DashboardFindingsReview companyId={company.id} findings={findings} total={summary.total}
          periodSelector={periodSelector} currentPeriod={period} switching={switching}
          comparisonPeriod={comparisonRun ? `${toJalaliDate(comparisonRun.period_start)} تا ${toJalaliDate(comparisonRun.period_end)}` : undefined} />}
        companyId={company.id}
        dashboard={execDashboard}
        onRefresh={onRefreshExec}
        loading={loadingExec}
      />
      {workingCapital && (
        <section
          className="dashboard-capital"
          aria-labelledby="dashboard-capital-title"
        >
          <div>
            <h2 id="dashboard-capital-title">چرخه نقد فعلی</h2><p>بر پایهٔ آخرین داده‌های ثبت‌شده؛ مستقل از دورهٔ یافته‌ها</p>
          </div>
          {[
            {
              label: "تاب‌آوری نقد",
              explanation: "مدت پوشش هزینه‌ها با موجودی نقد و نرخ مصرف فعلی",
              value: workingCapital.runwayDays,
              href: `${base}/cashflow`,
            },
            {
              label: "دوره وصول مطالبات",
              explanation: "میانگین زمان وصول وجه فروش",
              value: workingCapital.dsoDays,
              href: `${base}/receivables`,
            },
            {
              label: "دوره پرداخت بدهی",
              explanation: "میانگین زمان پرداخت به تأمین‌کنندگان",
              value: workingCapital.dpoDays,
              href: `${base}/payables`,
            },
            {
              label: "چرخه تبدیل نقد",
              explanation: workingCapital.cccDays == null ? "زمان تبدیل فروش به نقد، پس از کسر دوره پرداخت" : workingCapital.cccDays < 0 ? "میانگین دورهٔ وصول کوتاه‌تر از دورهٔ پرداخت است" : "دورهٔ وصول منهای دورهٔ پرداخت؛ بر حسب روز",
              value: workingCapital.cccDays,
              href: `${base}/cashflow`,
            },
          ].map((item) => (
            <Link key={item.label} href={item.href}>
              <span>{item.label}</span>
              <strong>
                <bdi dir="ltr">{item.value == null ? "—" : new Intl.NumberFormat("fa-IR").format(item.value)}</bdi>
                {item.value != null && <small> روز</small>}
              </strong>
              <p>{item.value == null ? "دادهٔ کافی برای محاسبه وجود ندارد" : item.explanation}</p>
            </Link>
          ))}
        </section>
      )}

      <section className="dashboard-data-coverage" aria-labelledby="dashboard-coverage-title"><div><h2 id="dashboard-coverage-title">پشتوانه این گزارش</h2><p>پوشش و آخرین وضعیت منابع مالی</p></div><div className="dashboard-coverage-sources">{execDashboard?.freshness?.sources?.map((source) => <div key={source.source_kind} className="dashboard-coverage-source"><span className={source.is_stale ? "is-stale" : ""} aria-hidden="true" /><div><strong>{source.title_fa}</strong><small>{source.last_record_date ? `داده تا ${toJalaliDate(source.last_record_date)}` : "داده دریافت نشده"}</small></div></div>)}</div><Link className="dashboard-text-link" href={`${base}/data`}>بررسی منابع<ChevronLeft size={14} /></Link></section>
      {dashboard.coverage?.limitations_fa?.length ? <div className="dashboard-coverage-limitations"><strong>محدودیت پوشش تحلیل</strong>{dashboard.coverage.limitations_fa.map((limitation) => <p key={limitation}>{limitation}</p>)}</div> : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div
      className="financial-dashboard dashboard-skeleton"
      role="status"
      aria-label="در حال بارگذاری داشبورد مالی"
    >
      <Skeleton className="h-16 max-w-lg" />
      <Skeleton className="h-16 w-full" />
      <div className="dashboard-kpis">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-40 rounded-[var(--ds-card-radius)]" />
        ))}
      </div>
      <div className="dashboard-insights">
        <Skeleton className="h-80 rounded-[var(--ds-card-radius)]" />
        <Skeleton className="h-80 rounded-[var(--ds-card-radius)]" />
      </div>
    </div>
  );
}
