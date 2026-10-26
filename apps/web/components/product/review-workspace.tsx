"use client";
import { fieldIcon } from "@/components/ui/field-layout";
import { SearchInput } from "@/components/ui/search-input";
import { Badge } from "@/components/ui/badge";
import { FormMessage } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/financial/status-badge";
import { RiskBadge } from "@/components/ui/financial/risk-badge";
import { StatusMessage, ErrorState, PageHeader, toPersianDigits } from "@/components/ui/financial";

import { TableEmptyCell, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableRowHeader } from "@/components/ui/table";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Company } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer } from "@/components/ui/drawer";
import { TablePagination } from "@/components/ui/table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCcw, FileUp, Landmark } from "@/components/ui/icons";
import { StatCards } from "@/components/ui/financial/stat-cards";
import { reviewStatusLabels, reviewSeverityLabels, reviewReconciliationLabels, type ReviewItem } from "@/lib/review";
import { ReviewScopeControl } from "./review-scope-control";
import { useReviewWorkspace } from "./use-review-workspace";
import pageStyles from "./cashflow-overview.module.css";
import { ReviewDirectionFilters } from "./review-direction-filters";
import { ReviewPreview } from "./review-preview";

export function ReviewWorkspace({ company }: { company: Company }) {
  return <ReviewContent key={company.id} company={company} />;
}
function ReviewContent({ company }: { company: Company }) {
  const { refresh, summary, summaryLoading, summaryFailed, setSummaryRetry, list, loading, listFailed, direction, changeDirection, search, setSearch, query, status, setStatus, page, setPage, pageSize, setPageSize, setRetry, running, runMessage, runFailed, cards, detect } = useReviewWorkspace(company.id);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const restoreListFocus = useRef(false);
  const [savingDecision, setSavingDecision] = useState(false);
  const [selected, setSelected] = useState<ReviewItem | null>(null);
  return <div dir="rtl" className={pageStyles.page}>
    <PageHeader title="بررسی و پیگیری" secondaryActions={<Button variant="outline" asChild><Link href={`/companies/${company.id}/imports`}><FileUp size={16} aria-hidden="true" />بارگذاری اسناد</Link></Button>} primaryAction={company.role && ["owner", "finance_manager", "advisor"].includes(company.role) ? <><ReviewScopeControl companyId={company.id} busy={running} onApply={(scope) => void detect(scope)} /><Button variant="outline" disabled={running} onClick={() => void detect()}><RefreshCcw size={16} aria-hidden="true" />{running ? "در حال بررسی…" : "بررسی دوباره"}</Button></> : undefined} />
    {!!summary?.latest_reconciliation?.limitations?.length && <StatusMessage><ul className="grid gap-1">{summary.latest_reconciliation.limitations.map((reason) => <li key={reason}>{reason}</li>)}</ul></StatusMessage>}
    <section aria-label="آمار بررسی و پیگیری" aria-busy={summaryLoading}>
      {summaryFailed ? <ErrorState onRetry={() => setSummaryRetry((value) => value + 1)} variant="compact" ><p>آمار بررسی و پیگیری دریافت نشد.</p></ErrorState> : <StatCards items={cards} loading={summaryLoading} />}
    </section>
    {runMessage && (runFailed ? <FormMessage>{runMessage}</FormMessage> : <StatusMessage>{runMessage}</StatusMessage>)}
    <section className="min-w-0 overflow-hidden rounded-[var(--ds-card-radius)] border border-border bg-card" aria-labelledby="review-list-title" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-5 px-4 py-5 sm:px-6"><h2 ref={listHeading} tabIndex={-1} id="review-list-title" className="text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary">موارد قابل بررسی</h2><div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
        <SearchInput label="جستجوی مورد" className="w-full sm:w-56" placeholder="جستجوی مورد" value={search} onChange={(event) => setSearch(event.target.value)}  />
        <Select dir="rtl" value={status} onValueChange={(value) => { setStatus(value); setPage(0); }}><SelectTrigger aria-label="وضعیت بررسی" icon={fieldIcon("وضعیت بررسی")} className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">همه وضعیت‌ها</SelectItem>{Object.entries(reviewStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      </div></div>
      <ReviewDirectionFilters value={direction} counts={listFailed ? undefined : list?.direction_counts} loading={loading} onChange={changeDirection} />
      {listFailed ? <ErrorState onRetry={() => setRetry((value) => value + 1)} variant="compact" ><p>فهرست موارد دریافت نشد.</p></ErrorState> : <><div className="min-w-0"><Table className="min-w-[640px]" containerClassName="border-0">
        <TableHeader><TableRow><TableHead scope="col">موضوع</TableHead><TableHead scope="col">تطبیق</TableHead><TableHead scope="col">اهمیت</TableHead><TableHead scope="col">وضعیت</TableHead><TableHead scope="col">مسئول پیگیری</TableHead></TableRow></TableHeader>
        <TableBody loading={loading}>{loading ? Array.from({ length: list?.items.length || pageSize }, (_, row) => <TableRow key={row}>{[0, 1, 2, 3, 4].map((cell) => <TableCell key={cell}><Skeleton className="h-11 w-full" /></TableCell>)}</TableRow>) : list?.items.length ? list.items.map((item) => <TableRow key={item.id} onActivate={() => setSelected(item)}>
          <TableRowHeader scope="row"><Button variant="ghost" className="h-auto min-h-11 max-w-80 justify-start whitespace-normal px-0 text-start font-normal" onClick={(event) => { event.currentTarget.focus(); setSelected(item); }}>{toPersianDigits(item.title_fa)}</Button></TableRowHeader><TableCell><Badge variant="secondary">{reviewReconciliationLabels[item.reconciliation_state ?? "not_applicable"]}</Badge></TableCell><TableCell><RiskBadge level={item.severity} label={reviewSeverityLabels[item.severity] ?? "نامشخص"} size="sm" /></TableCell><TableCell><StatusBadge status={item.status} label={reviewStatusLabels[item.status] ?? "نامشخص"} /></TableCell><TableCell>{item.assigned_to_name ?? "تعیین نشده"}</TableCell>
        </TableRow>) : <TableRow><TableEmptyCell colSpan={5} className="h-40 p-0 text-center text-muted-foreground">{query || status !== "all" || direction !== "all" ? "موردی با این جستجو و فیلتر پیدا نشد." : <div className="grid justify-items-center gap-3"><span>موردی ثبت نشده است.</span><Button asChild variant="outline"><Link href={`/companies/${company.id}/imports`}>بارگذاری اسناد</Link></Button></div>}</TableEmptyCell></TableRow>}</TableBody>
      </Table></div><TablePagination total={list?.total_count ?? 0} page={page} pageSize={pageSize} loading={loading} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(0); }} /></>}
    </section>
    <Drawer onCloseAutoFocus={(event) => { if (restoreListFocus.current) { event.preventDefault(); listHeading.current?.focus(); restoreListFocus.current = false; } }} closeDisabled={savingDecision} titleIcon={<Landmark size={24} />} className="md:!w-[min(960px,88vw)] [&>div:last-child]:gap-7 [&>div:last-child]:bg-muted/15 [&>div:last-child]:px-5 [&>div:last-child]:pt-6 sm:[&>div:last-child]:px-8" size="wide" open={!!selected} onOpenChange={(open) => { if (!open && !savingDecision) setSelected(null); }} title={selected ? toPersianDigits(selected.title_fa) : "جزئیات مورد"}>
      {selected && <ReviewPreview key={selected.id} companyId={company.id} item={selected} onBusyChange={setSavingDecision} onChanged={() => { restoreListFocus.current = true; refresh(); }} onDetailChange={(detail) => setSelected(current => current ? { ...current, title_fa: detail.title_fa ?? current.title_fa, status: detail.status, reconciliation_state: detail.reconciliation_state } : current)} />}
    </Drawer>
  </div>;
}
