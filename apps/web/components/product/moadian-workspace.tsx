"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/product-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Disclosure } from "@/components/ui/disclosure";
import { LoadingState, ErrorState, EmptyState, PageHeader, toJalaliDate } from "@/components/ui/financial";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, SlidersHorizontal, Plus } from "@/components/ui/icons";
import { StatCards } from "@/components/ui/financial/stat-cards";
import type { ComparisonItem } from "@/lib/moadian";
import type { Company } from "@/lib/product-types";
import { useMoadianComparison } from "./use-moadian-comparison";
import { MoadianComparisonDetails, MoadianComparisonResults } from "./moadian-comparison-results";
import { MoadianComparisonSetup, MoadianSourceSummary } from "./moadian-comparison-setup";
import { MoadianResultFilters } from "./moadian-result-filters";
import { MoadianComparisonHome } from "./moadian-comparison-home";
import { MoadianComparisonHistory } from "./moadian-comparison-history";

type Controller = ReturnType<typeof useMoadianComparison>;
type WorkspaceProps = { company: Company; request?: typeof api; initialRunId?: string };
export function MoadianWorkspace(props: WorkspaceProps) {
  return <MoadianController key={props.company.id} {...props} />;
}
function MoadianController({ company, request, initialRunId }: WorkspaceProps) {
  const controller = useMoadianComparison(company.id, company.role, { request, initialRunId });
  return <MoadianView company={company} controller={controller} />;
}
function MoadianView({ company, controller: c }: { company: Company; controller: Controller }) {
  const [selected, setSelected] = useState<ComparisonItem | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const showResults = !!c.applied;
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (showResults) resultsHeading.current?.focus(); }, [showResults]);
  function openSetup(fresh: boolean) {
    if (fresh) c.startNew();
    setSetupOpen(true);
  }
  function closeSetup(open: boolean) {
    setSetupOpen(open);
    if (!open) c.restoreDraft();
  }
  function openReport(id: string) { setHistoryOpen(false); void c.openRun(id); }
  return <div dir="rtl" className="flex min-w-0 flex-col gap-6">
    <PageHeader title="تطبیق مؤدیان" badge={showResults ? <Badge variant="secondary">{c.applied?.direction === "sales" ? "فروش" : "خرید"}</Badge> : undefined}
      primaryAction={<Button disabled={c.loading || c.loadingFiles || !c.canStart} onClick={() => openSetup(true)}><Plus size={16} aria-hidden="true" />تطبیق جدید</Button>}
      secondaryActions={showResults ? <Button variant="outline" onClick={() => setHistoryOpen(true)}>تطبیق‌های قبلی</Button> : undefined} />
    {c.error && !setupOpen && <ErrorState onRetry={c.retry} variant="compact">{c.error}</ErrorState>}
    {showResults ? <>
      <section aria-label="گزارش تطبیق" className="grid gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><span className="flex flex-wrap items-center gap-2 text-sm"><Calendar size={16} className="text-muted-foreground" aria-hidden="true" />{toJalaliDate(c.applied!.start)}<span className="text-muted-foreground">تا</span>{toJalaliDate(c.applied!.end)}</span><Button variant="ghost" disabled={c.loading} onClick={() => openSetup(false)}><SlidersHorizontal size={16} aria-hidden="true" />ویرایش تطبیق</Button></div>
        <Disclosure title="منابع و مشخصات گزارش"><MoadianSourceSummary c={{ ...c, selectedInternal: c.reportInternal, selectedPortal: c.reportPortal }} />{c.filesError && <ErrorState variant="compact" onRetry={c.refreshFiles}>{c.filesError}</ErrorState>}{c.report?.run_id && <Button asChild variant="ghost"><Link href={`/companies/${company.id}/moadian/runs/${c.report.run_id}`}>پیوند گزارش ذخیره‌شده</Link></Button>}</Disclosure>
      </section>
      {(c.summary || c.loading) && <StatCards className="md:grid-cols-4" loading={c.loading && !c.summary} items={c.cards} />}
      <section aria-label="بررسی نتایج" className="min-w-0 space-y-4">
        <h2 ref={resultsHeading} tabIndex={-1} className="font-[family-name:var(--font-display)] text-xl font-bold outline-none">نتایج تطبیق</h2>
        <MoadianResultFilters status={c.status} counts={c.summary?.counts} onChange={c.setStatus} />
        <MoadianComparisonResults report={c.report} loading={c.loading} onInspect={(item) => { c.clearReviewError(); setSelected(item); }} onPage={c.setOffset} pageSize={c.pageSize} offset={c.offset} total={c.summary?.total ?? 0} onPageSizeChange={c.changePageSize} />
      </section>
    </> : c.loading ? <LoadingState aria-label="دریافت نتیجه تطبیق" variant="details"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></LoadingState> : <MoadianComparisonHome c={c} companyId={company.id} onNew={() => openSetup(true)} onOpen={openReport} />}
    <Drawer size="wide" open={setupOpen} onOpenChange={closeSetup} title="تنظیم تطبیق مؤدیان">
      {c.filesError ? <ErrorState onRetry={c.refreshFiles}>{c.filesError}</ErrorState> : c.loadingFiles ? <LoadingState aria-label="دریافت منابع تطبیق" variant="details"><Skeleton className="h-64 w-full" /></LoadingState> : <>
        <MoadianComparisonSetup c={c} onSubmit={() => { if (c.canSubmit) { void c.submit(); setSetupOpen(false); } }} />
        {c.writable && <Button asChild variant="outline"><Link href={`/companies/${company.id}/imports`}>مدیریت اسناد</Link></Button>}
      </>}
    </Drawer>
    <Drawer size="wide" open={historyOpen} onOpenChange={setHistoryOpen} title="تطبیق‌های قبلی">
      {c.historyLoading ? <LoadingState aria-label="دریافت تطبیق‌های قبلی" variant="details"><Skeleton className="h-40 w-full" /></LoadingState> : c.historyError ? <ErrorState onRetry={c.refreshHistory}>{c.historyError}</ErrorState> : c.history.length ? <MoadianComparisonHistory runs={c.history} busy={c.loading} onOpen={openReport} /> : <EmptyState title="تطبیق ذخیره‌شده‌ای موجود نیست" />}
    </Drawer>
    <MoadianComparisonDetails item={selected} batches={c.batches} onClose={() => { if (!c.reviewBusy) setSelected(null); }} writable={c.writable && !!c.report?.run_id} busy={c.reviewBusy} error={c.reviewError} onSave={(note, decision) => { if (selected) void c.saveReview(selected, note, decision).then((item) => { if (item) setSelected(item); }); }} />
  </div>;
}
