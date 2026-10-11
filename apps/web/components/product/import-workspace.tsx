"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { API_URL, api } from "@/lib/product-api";
import type { Company, ImportBatch } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerDetails, DrawerSection } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, toPersianDigits } from "@/components/ui/financial";
import { Download, Search } from "@/components/ui/icons";
import { UploadWizard } from "./upload-wizard";
import pageStyles from "./cashflow-overview.module.css";
import tableStyles from "./receivables-customers.module.css";
import detailStyles from "./reports-workspace.module.css";
import styles from "./import-rows.module.css";

type RowIssue = { field: string | null; severity: string; message: string; remedy: string | null };
type SourceRow = { id: string; row_number: number; raw: Record<string, unknown>; issues: RowIssue[] };
type RowsPage = { columns: string[]; items: SourceRow[]; total_count: number };
const pageSize = 25;
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
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<SourceRow | null>(null);
  const [wizard, setWizard] = useState(false);
  const [busy, setBusy] = useState(false);
  const writable = !!company.role && ["owner", "finance_manager", "advisor"].includes(company.role);
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
  }, [company.id, batchId, scanClean, query, status, page, retry]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [rows]);
  const retryLoad = () => setRetry((value) => value + 1);
  const columns = rows?.columns ?? [];
  return <div dir="rtl" className={pageStyles.page}>
    <PageHeader title="ردیف‌های سند" secondaryActions={<Button variant="outline" asChild><Link href={`/companies/${company.id}/imports`}>بازگشت به اسناد</Link></Button>} primaryAction={writable && resumable ? <Button variant="outline" onClick={() => setWizard(true)}>ادامه بارگذاری</Button> : batch && scanClean ? <Button variant="outline" asChild><a href={`${API_URL}/companies/${company.id}/imports/${batchId}/download`}><Download size={16} aria-hidden="true" />دریافت فایل</a></Button> : undefined} />
    {batchFailed ? <div role="alert" className={pageStyles.error}><p>اطلاعات سند دریافت نشد.</p><Button variant="outline" onClick={retryLoad}>تلاش دوباره</Button></div> : batchLoading ? <Skeleton className="h-64 w-full" /> : batch && <section className={tableStyles.section} aria-labelledby="import-rows-title" aria-busy={loading && scanClean}>
      <div className={tableStyles.heading}><h2 id="import-rows-title" className={styles.filename}><bdi>{batch.original_name}</bdi></h2><div className={tableStyles.controls}>
        <div className={tableStyles.search}><Search size={17} aria-hidden="true" /><Input aria-label="جستجوی ردیف" placeholder="جستجوی ردیف" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <Select dir="rtl" value={status} onValueChange={(value) => { setStatus(value); setPage(0); }}><SelectTrigger aria-label="وضعیت ردیف" className="w-40 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">همه ردیف‌ها</SelectItem><SelectItem value="accepted">بدون خطا</SelectItem><SelectItem value="rejected">دارای خطا</SelectItem></SelectContent></Select>
      </div></div>
      {!scanClean ? <p role="status" className={tableStyles.empty}>{batch.failure_message ?? "فایل هنوز برای نمایش ردیف‌ها آماده نیست."}</p> : failed ? <div role="alert" className={tableStyles.empty}><p>ردیف‌ها دریافت نشدند.</p><Button variant="outline" onClick={retryLoad}>تلاش دوباره</Button></div> : <>
        <div ref={scrollRef} tabIndex={0} role="region" aria-label="جدول ردیف‌ها" className={`${tableStyles.scroll} ${styles.scroll}`}><table className={`${tableStyles.table} ${styles.table}`}><thead><tr><th scope="col">ردیف منبع</th><th scope="col">وضعیت</th>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{loading ? [0, 1, 2].map((index) => <tr key={index}>{Array.from({ length: columns.length + 2 }, (_, cell) => <td key={cell}><Skeleton className="h-5 w-28" /></td>)}</tr>) : rows?.items.length ? rows.items.map((row) => <tr key={row.id}>
            <th scope="row"><Button variant="ghost" className={tableStyles.customer} aria-label={`مشاهده ردیف ${toPersianDigits(row.row_number)}`} onClick={() => setSelected(row)}>{toPersianDigits(row.row_number)}</Button></th>
            <td>{rejected(row) ? "دارای خطا" : row.issues.length ? "بدون خطا، با هشدار" : "بدون خطا"}</td>
            {columns.map((column) => <td key={column}><span className={styles.cell} title={displayValue(row.raw[column])}><bdi>{displayValue(row.raw[column])}</bdi></span></td>)}
          </tr>) : <tr><td colSpan={columns.length + 2} className={tableStyles.empty}>{query || status !== "all" ? "ردیفی با این جستجو و فیلتر پیدا نشد." : resumable ? "برای نمایش ردیف‌ها، بارگذاری سند را ادامه دهید." : "ردیفی برای این سند ثبت نشده است."}</td></tr>}</tbody>
        </table></div>
        {rows && rows.total_count > 0 && <div className={tableStyles.heading}><span className={styles.count}>{toPersianDigits(rows.total_count)} ردیف</span>{rows.total_count > pageSize && <><Button variant="outline" disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}>قبلی</Button><span className={styles.count}>صفحه {toPersianDigits(page + 1)} از {toPersianDigits(Math.ceil(rows.total_count / pageSize))}</span><Button variant="outline" disabled={loading || (page + 1) * pageSize >= rows.total_count} onClick={() => setPage((value) => value + 1)}>بعدی</Button></>}</div>}
      </>}
    </section>}
    <Drawer open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }} title={selected ? `ردیف ${toPersianDigits(selected.row_number)}` : "جزئیات ردیف"} description="مقادیر اصلی و ایرادهای این ردیف">
      {selected && <><DrawerDetails>{Object.entries(selected.raw).map(([key, value]) => <div key={key}><dt>{key}</dt><dd><bdi>{displayValue(value)}</bdi></dd></div>)}</DrawerDetails>
        {selected.issues.length > 0 && <DrawerSection title="ایرادهای ردیف">{selected.issues.map((issue, index) => <div key={index} className={styles.issue}><p className={issue.severity === "warning" ? detailStyles.note : detailStyles.error}>{issue.message}</p>{issue.remedy && <p className={detailStyles.caption}>{issue.remedy}</p>}</div>)}</DrawerSection>}
      </>}
    </Drawer>
    <Drawer open={wizard} onOpenChange={(open) => { if (!busy) setWizard(open); }} title="بارگذاری فایل" description="ادامه بارگذاری مرحله‌ای سند">
      {wizard && batch && <UploadWizard company={company} initialBatch={batch} onSaving={setBusy} onCancel={() => { setWizard(false); retryLoad(); }} onUpdated={setBatch} onDone={(result) => { setBatch(result); setWizard(false); retryLoad(); }} />}
    </Drawer>
  </div>;
}
