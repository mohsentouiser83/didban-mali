"use client";
import { SearchInput } from "@/components/ui/search-input";
import { DetailSection, DetailGroup, DetailField, fieldIcon } from "@/components/ui/field-layout";
import { FieldDescription } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/financial/status-badge";
import { TruncatedText } from "@/components/ui/tooltip";
import { LoadingState } from "@/components/ui/financial/loading-state";
import { ErrorState, StatusMessage, PageHeader, toPersianDigits } from "@/components/ui/financial";

import { TableEmptyCell, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableRowHeader } from "@/components/ui/table";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { API_URL, api } from "@/lib/product-api";
import type { Company, ImportBatch } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer } from "@/components/ui/drawer";
import { TablePagination } from "@/components/ui/table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "@/components/ui/icons";
import { SettlementImportSummary } from "./settlement-import-summary";
import { Badge } from "@/components/ui/badge";
import { UploadWizard } from "./upload-wizard";
import pageStyles from "./cashflow-overview.module.css";
import tableStyles from "./receivables-customers.module.css";
import detailStyles from "./reports-workspace.module.css";
import styles from "./import-rows.module.css";

type RowIssue = { field: string | null; severity: string; message: string; remedy: string | null };
type ProcessingResult = { status?: string; reason?: string; invoice_source_row_id?: string; allocation_id?: string };
const resultLabels: Record<string, string> = { matched: "اتصال ثبت‌شده", duplicate: "قبلاً ثبت‌شده", review: "نیازمند بررسی", invalid: "نامعتبر", reversed: "برگشت داده‌شده" };
type SourceRow = { processing_result?: ProcessingResult; id: string; row_number: number; raw: Record<string, unknown>; issues: RowIssue[] };
type RowsPage = { columns: string[]; items: SourceRow[]; total_count: number };
const displayValue = (value: unknown) => value == null || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);
const rejected = (row: SourceRow) => row.issues.some((issue) => issue.severity === "error" || issue.severity === "blocking");

export function ImportWorkspace({ company, batchId }: { company: Company; batchId: string }) {
  return <ImportRows key={`${company.id}:${batchId}`} company={company} batchId={batchId} />;
}
function ImportRows({ company, batchId }: { company: Company; batchId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [batchLoading, setBatchLoading] = useState(true);
  const [batchFailed, setBatchFailed] = useState(false);
  const [rows, setRows] = useState<RowsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<SourceRow | null>(null);
  const [wizard, setWizard] = useState(false);
  const [busy, setBusy] = useState(false);
  const writable = !!company.role && ["owner", "finance_manager", "advisor"].includes(company.role);
  const settlementImport = batch?.source_kind.startsWith("settlement_") ?? false;
  const resumable = !!batch && (["uploaded", "inspecting", "awaiting_mapping"].includes(batch.status) || batch.retryable);
  useEffect(() => {
    let active = true;
    setBatchLoading(true); setBatchFailed(false);
    api<ImportBatch>(`/companies/${company.id}/imports/${batchId}`)
      .then((result) => { if (active) setBatch(result); })
      .catch(() => { if (active) setBatchFailed(true); })
      .finally(() => { if (active) setBatchLoading(false); });
    return () => { active = false; };
  }, [company.id, batchId, retry]);
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const scanClean = batch?.scan_status === "clean";
  useEffect(() => {
    if (!scanClean) return;
    let active = true;
    setLoading(true); setFailed(false);
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize), row_status: status });
    if (query) params.set("search", query);
    api<RowsPage>(`/companies/${company.id}/imports/${batchId}/rows?${params}`)
      .then((result) => { if (active) setRows(result); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [company.id, batchId, scanClean, query, status, page, pageSize, retry]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [rows]);
  const retryLoad = () => setRetry((value) => value + 1);
  const columns = rows?.columns ?? [];
  return <div dir="rtl" className={pageStyles.page}>
    <PageHeader title="ردیف‌های سند" secondaryActions={<Button variant="outline" asChild><Link href={`/companies/${company.id}/imports`}>بازگشت به اسناد</Link></Button>} primaryAction={writable && resumable ? <Button variant="outline" onClick={() => setWizard(true)}>ادامه بارگذاری</Button> : batch && scanClean ? <Button variant="outline" asChild><a href={`${API_URL}/companies/${company.id}/imports/${batchId}/download`}><Download size={16} aria-hidden="true" />دریافت فایل</a></Button> : undefined} />
    {batch && settlementImport && <SettlementImportSummary companyId={company.id} batch={batch} canWrite={writable} onUpdated={retryLoad} />}
    {batchFailed ? <ErrorState onRetry={retryLoad} variant="compact" ><p>اطلاعات سند دریافت نشد.</p></ErrorState> : batchLoading ? <LoadingState variant="details" rows={2} /> : batch && <section className={tableStyles.section} aria-labelledby="import-rows-title" aria-busy={loading && scanClean}>
      <div className={tableStyles.heading}><h2 id="import-rows-title" className={styles.filename}><bdi>{batch.original_name}</bdi></h2><div className={tableStyles.controls}>
        <SearchInput label="جستجوی ردیف" className="w-full sm:w-56" placeholder="جستجوی ردیف" value={search} onChange={(event) => setSearch(event.target.value)}  />
        <Select dir="rtl" value={status} onValueChange={(value) => { setStatus(value); setPage(0); }}><SelectTrigger aria-label="وضعیت ردیف" icon={fieldIcon("وضعیت ردیف")} className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">همه ردیف‌ها</SelectItem>{settlementImport && <><SelectItem value="review">نیازمند بررسی</SelectItem><SelectItem value="matched">اتصال ثبت‌شده</SelectItem></>}<SelectItem value="accepted">بدون خطا</SelectItem><SelectItem value="rejected">دارای خطا</SelectItem></SelectContent></Select>
      </div></div>
      {!scanClean ? <StatusMessage  >{batch.failure_message ?? "فایل هنوز برای نمایش ردیف‌ها آماده نیست."}</StatusMessage> : failed ? <ErrorState onRetry={retryLoad} variant="compact" ><p>ردیف‌ها دریافت نشدند.</p></ErrorState> : <>
        <div className="min-w-0"><Table aria-label="جدول ردیف‌ها" density="compact" containerRef={scrollRef} className="min-w-[640px]" containerClassName="border-0 max-h-[65vh]"><TableHeader><TableRow><TableHead scope="col">ردیف منبع</TableHead><TableHead scope="col">وضعیت</TableHead>{settlementImport && <TableHead scope="col">نتیجه تسویه</TableHead>}{columns.map((column) => <TableHead key={column} scope="col">{column}</TableHead>)}</TableRow></TableHeader>
          <TableBody loading={loading}>{loading ? Array.from({ length: rows?.items.length || pageSize }, (_, index) => <TableRow key={index}>{Array.from({ length: columns.length + (settlementImport ? 3 : 2) }, (_, cell) => <TableCell key={cell}><Skeleton className="h-11 w-28" /></TableCell>)}</TableRow>) : rows?.items.length ? rows.items.map((row) => <TableRow key={row.id} onActivate={() => setSelected(row)}>
            <TableRowHeader scope="row"><Button variant="ghost" className="h-auto min-h-11 max-w-80 justify-start whitespace-normal px-0 text-start font-normal" aria-label={`مشاهده ردیف ${toPersianDigits(row.row_number)}`} onClick={() => setSelected(row)}>{toPersianDigits(row.row_number)}</Button></TableRowHeader>
            <TableCell><StatusBadge status={rejected(row) ? "failed" : row.issues.length ? "completed_limited" : "completed"} label={rejected(row) ? "دارای خطا" : row.issues.length ? "بدون خطا، با هشدار" : "بدون خطا"} size="xs" /></TableCell>
            {settlementImport && <TableCell><Badge variant={row.processing_result?.status === "review" ? "warning" : "secondary"}>{row.processing_result?.status ? resultLabels[row.processing_result.status] ?? "نامشخص" : "در انتظار پردازش"}</Badge></TableCell>}
            {columns.map((column) => <TableCell key={column}><TruncatedText text={displayValue(row.raw[column])} className="max-w-64" /></TableCell>)}
          </TableRow>) : <TableRow><TableEmptyCell colSpan={columns.length + (settlementImport ? 3 : 2)} className="h-40 p-0 text-center text-muted-foreground">{query || status !== "all" ? "ردیفی با این جستجو و فیلتر پیدا نشد." : resumable ? "برای نمایش ردیف‌ها، بارگذاری سند را ادامه دهید." : "ردیفی برای این سند ثبت نشده است."}</TableEmptyCell></TableRow>}</TableBody>
        </Table></div>
        <TablePagination total={rows?.total_count ?? 0} page={page} pageSize={pageSize} loading={loading} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(0); }} />
      </>}
    </section>}
    <Drawer size="wide" open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }} title={selected ? `ردیف ${toPersianDigits(selected.row_number)}` : "جزئیات ردیف"} description="مقادیر اصلی و ایرادهای این ردیف">
      {selected && <>
        {selected.processing_result?.status && <DetailSection title="نتیجه تسویه">
          <p className="text-sm">{resultLabels[selected.processing_result.status] ?? "نامشخص"}</p>
          {selected.processing_result.reason && <StatusMessage tone="warning">{selected.processing_result.reason}</StatusMessage>}
          {selected.processing_result.invoice_source_row_id && <Button asChild variant="outline"><Link href={`/companies/${company.id}/settlements${selected.processing_result.invoice_source_row_id ? `?invoice=${selected.processing_result.invoice_source_row_id}` : ""}`}>{selected.processing_result.status === "review" ? "بررسی اتصال به بانک" : "مشاهده فاکتور و تخصیص‌ها"}</Link></Button>}
        </DetailSection>}
        <DetailGroup>{Object.entries(selected.raw).map(([key, value]) => <DetailField key={key} icon={fieldIcon(key)} label={<>{key}</>}><bdi>{displayValue(value)}</bdi></DetailField>)}</DetailGroup>
        {selected.issues.length > 0 && <DetailSection title="ایرادهای ردیف">{selected.issues.map((issue, index) => <div key={index} className="grid gap-2"><FormMessage role="note" variant={issue.severity === "warning" ? "warning" : "destructive"}>{issue.message}</FormMessage>{issue.remedy && <FieldDescription>{issue.remedy}</FieldDescription>}</div>)}</DetailSection>}
      </>}
    </Drawer>
    <Drawer size="wide" open={wizard} onOpenChange={(open) => { if (!busy) setWizard(open); }} title="بارگذاری فایل" description="ادامه بارگذاری مرحله‌ای سند">
      {wizard && batch && <UploadWizard company={company} initialBatch={batch} onSaving={setBusy} onCancel={() => { setWizard(false); retryLoad(); }} onUpdated={setBatch} onDone={(result) => { setBatch(result); setWizard(false); retryLoad(); }} />}
    </Drawer>
  </div>;
}
