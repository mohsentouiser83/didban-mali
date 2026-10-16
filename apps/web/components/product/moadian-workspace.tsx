"use client";
import { Badge } from "@/components/ui/badge";
import { LoadingState, ErrorState, PageHeader, toJalaliDate } from "@/components/ui/financial";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Calendar, SlidersHorizontal } from "@/components/ui/icons";
import type { ComparisonItem } from "@/lib/moadian";
import type { Company, ImportBatch } from "@/lib/product-types";
import { UploadWizard } from "./upload-wizard";
import { StatCards } from "@/components/ui/financial/stat-cards";
import { useMoadianComparison } from "./use-moadian-comparison";
import { MoadianComparisonDetails, MoadianComparisonResults } from "./moadian-comparison-results";
import { MoadianComparisonSetup, MoadianSourceSummary } from "./moadian-comparison-setup";
import { MoadianResultFilters } from "./moadian-result-filters";

type Controller = ReturnType<typeof useMoadianComparison>;
export function MoadianWorkspace({ company }: { company: Company }) {
  const controller = useMoadianComparison(company.id, company.role);
  return <MoadianView key={company.id} company={company} controller={controller} />;
}

function MoadianView({ company, controller: c }: { company: Company; controller: Controller }) {
  const [upload, setUpload] = useState<ImportBatch["source_kind"] | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [selected, setSelected] = useState<ComparisonItem | null>(null);
  const [editing, setEditing] = useState(false);
  const showResults = !!c.applied && !editing;
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (showResults) resultsHeading.current?.focus(); }, [showResults]);
  return <div dir="rtl" className="flex min-w-0 flex-col gap-6">
    <PageHeader title="تطبیق مؤدیان" badge={showResults ? <Badge variant="secondary">{c.applied?.direction === "sales" ? "فروش" : "خرید"}</Badge> : undefined} primaryAction={showResults ? <Button variant="outline" onClick={() => { c.reset(); setEditing(false); }}><ArrowLeft size={16} aria-hidden="true" />تطبیق جدید</Button> : undefined} />
    {c.filesError ? <ErrorState onRetry={c.refreshFiles} variant="compact" >{c.filesError}</ErrorState> : c.loadingFiles ? <LoadingState aria-label="دریافت فایل‌ها" aria-busy="true" variant="details"><Skeleton className="h-8 w-64 max-w-full" /><div className="grid gap-6 md:grid-cols-2"><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div><Skeleton className="ms-auto h-11 w-36" /></LoadingState> : showResults ? <section aria-label="منابع گزارش" className="flex flex-col gap-4 rounded-[var(--ds-card-radius)] border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="flex flex-wrap items-center gap-2 text-sm"><Calendar size={16} className="text-muted-foreground" aria-hidden="true" />{toJalaliDate(c.applied!.start)}<span className="text-muted-foreground">تا</span>{toJalaliDate(c.applied!.end)}</span><Button variant="ghost" onClick={() => setEditing(true)}><SlidersHorizontal size={16} aria-hidden="true" />ویرایش تطبیق</Button></div>
      <MoadianSourceSummary c={c} />
    </section> : <MoadianComparisonSetup c={c} onUpload={c.writable ? setUpload : undefined} onSubmit={() => { if (c.canSubmit) { c.submit(); setEditing(false); } }} />}
    {showResults && <>
      {c.error && <ErrorState onRetry={c.retry} variant="compact" >{c.error}</ErrorState>}
      {(c.summary || c.loading) && <StatCards loading={c.loading && !c.summary} items={c.cards} />}
      <section aria-label="بررسی نتایج" className="min-w-0 space-y-4">
        <h2 ref={resultsHeading} tabIndex={-1} className="font-[family-name:var(--font-display)] text-xl font-bold outline-none">نتایج تطبیق</h2>
        <MoadianResultFilters status={c.status} counts={c.summary?.counts} onChange={c.setStatus} />
        <MoadianComparisonResults report={c.report} loading={c.loading} onInspect={setSelected} onPage={c.setOffset} />
      </section>
    </>}
    <MoadianComparisonDetails item={selected} batches={c.batches} onClose={() => setSelected(null)} />
    <Drawer open={!!upload} onOpenChange={(open) => { if (!open && !uploadBusy) { setUpload(null); c.refreshFiles(); } }} title="ورود فایل برای تطبیق">
      {upload && <UploadWizard company={company} initialSourceKind={upload} onSaving={setUploadBusy} onCancel={() => { setUpload(null); c.refreshFiles(); }} onUpdated={c.refreshFiles} onDone={() => { setUpload(null); c.refreshFiles(); }} />}
    </Drawer>
  </div>;
}
