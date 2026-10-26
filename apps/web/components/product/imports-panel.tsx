"use client";
import { SearchInput } from "@/components/ui/search-input";
import { DetailGroup, DetailField, fieldIcon } from "@/components/ui/field-layout";
import { FormMessage } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/financial/status-badge";
import { ErrorState, StatusMessage, LoadingState, PageHeader, toJalaliDate, toPersianDigits } from "@/components/ui/financial";

import { TableEmptyCell, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableRowHeader } from "@/components/ui/table";

import { useEffect, useState } from "react";
import Link from "next/link";
import { sourceLabels } from "@/lib/import-mapping";
import { API_URL, api } from "@/lib/product-api";
import type { Company, ImportBatch, ImportStatus } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { FileUp, Download, Trash2, FileText, Clock, CheckCircle, AlertTriangle } from "@/components/ui/icons";
import { UploadWizard } from "./upload-wizard";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatCards } from "@/components/ui/financial/stat-cards";
import pageStyles from "./cashflow-overview.module.css";
import styles from "./receivables-customers.module.css";
import formStyles from "./reports-workspace.module.css";

type ImportSummary = { total_count: number; pending_count: number; completed_count: number; failed_count: number };

const statusLabels: Record<ImportStatus, string> = {
  uploaded: "دریافت شد", inspecting: "در حال بررسی امنیتی", awaiting_mapping: "آماده تأیید ستون‌ها",
  validating: "در حال اعتبارسنجی", queued: "در صف پردازش", processing: "در حال پردازش",
  completed: "تکمیل‌شده", completed_limited: "تکمیل محدود", failed: "ناموفق", cancelled: "لغوشده",
};

const pendingStatuses: ImportStatus[] = ["uploaded", "inspecting", "validating", "queued", "processing"];
const normalize = (value: string) => value.replace(/ي/g, "ی").replace(/ك/g, "ک").trim().toLocaleLowerCase();
const formatBytes = (bytes: number) => {
  const megabytes = bytes >= 1024 * 1024;
  return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(bytes / (megabytes ? 1024 * 1024 : 1024))} ${megabytes ? "مگابایت" : "کیلوبایت"}`;
};

export function ImportsPanel({ company }: { company: Company }) {
  return <ImportsContent key={company.id} company={company} />;
}

function ImportsContent({ company }: { company: Company }) {
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [summaryRetry, setSummaryRetry] = useState(0);
  const [items, setItems] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pollFailed, setPollFailed] = useState(false);
  const [pollRetry, setPollRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wizardBatch, setWizardBatch] = useState<ImportBatch | null>(null);
  const [creating, setCreating] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ImportBatch | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const writable = !!company.role && ["owner", "finance_manager", "advisor"].includes(company.role);

  useEffect(() => {
    let active = true;
    api<ImportBatch[]>(`/companies/${company.id}/imports`)
      .then((batches) => { if (active) { setItems(batches); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [company.id, retry]);

  const batchVersion = items.map((item) => `${item.id}:${item.status}`).join(",");
  useEffect(() => {
    let active = true;
    setSummaryLoading(true); setSummaryFailed(false);
    api<ImportSummary>(`/companies/${company.id}/imports/summary`)
      .then((result) => { if (active) setSummary(result); })
      .catch(() => { if (active) setSummaryFailed(true); })
      .finally(() => { if (active) setSummaryLoading(false); });
    return () => { active = false; };
  }, [company.id, batchVersion, summaryRetry, retry]);
  const cards = [
    { title: "کل اسناد", value: summary ? String(summary.total_count) : null, currency: "فایل", icon: FileText },
    { title: "در انتظار و پردازش", value: summary ? String(summary.pending_count) : null, currency: "فایل", icon: Clock },
    { title: "تکمیل‌شده", value: summary ? String(summary.completed_count) : null, currency: "فایل", icon: CheckCircle },
    { title: "ناموفق", value: summary ? String(summary.failed_count) : null, currency: "فایل", icon: AlertTriangle },
  ];

  const pendingIds = items.filter((item) => pendingStatuses.includes(item.status)).map((item) => item.id).join(",");
  useEffect(() => {
    if (!pendingIds) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const batches = await Promise.all(pendingIds.split(",").map((id) => api<ImportBatch>(`/companies/${company.id}/imports/${id}`)));
        if (!active) return;
        setPollFailed(false);
        setItems((current) => current.map((item) => batches.find((batch) => batch.id === item.id) ?? item));
        if (batches.some((batch) => pendingStatuses.includes(batch.status))) timer = setTimeout(() => void poll(), 4000);
      } catch { if (active) setPollFailed(true); }
    }
    timer = setTimeout(() => void poll(), 4000);
    return () => { active = false; clearTimeout(timer); };
  }, [company.id, pendingIds, pollRetry]);

  async function deleteBatch() {
    if (!deleteTarget || deleting) return;
    setDeleting(true); setError(""); setNotice("");
    try {
      await api(`/companies/${company.id}/imports/${deleteTarget.id}`, { method: "DELETE" });
      setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
      setSelectedId(null); setDeleteTarget(null);
      setNotice(`فایل «${deleteTarget.original_name}» با موفقیت حذف شد.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "حذف فایل انجام نشد."); setDeleteTarget(null); }
    finally { setDeleting(false); }
  }

  const filtered = items.filter((item) => normalize(`${item.original_name} ${item.source_label} ${sourceLabels[item.source_kind]}`).includes(normalize(search)) && (status === "all" || item.status === status));
  const selected = items.find((item) => item.id === selectedId);
  return <div dir="rtl" className={pageStyles.page}>
    <PageHeader title="بارگذاری اسناد" primaryAction={writable ? <Button variant="outline" onClick={() => { setWizardBatch(null); setCreating(true); }}><FileUp size={16} aria-hidden="true" />بارگذاری فایل</Button> : undefined} />
    <section aria-label="آمار بارگذاری اسناد" aria-busy={summaryLoading}>
      {summaryFailed ? <ErrorState onRetry={() => setSummaryRetry((value) => value + 1)} variant="compact" ><p>آمار اسناد دریافت نشد.</p></ErrorState> : <StatCards items={cards} loading={summaryLoading} />}
    </section>
    {notice && <StatusMessage  >{notice}</StatusMessage>}
    {error && <FormMessage>{error}</FormMessage>}
    {pollFailed && <ErrorState onRetry={() => setPollRetry((value) => value + 1)} variant="compact" ><p>وضعیت پردازش اسناد به‌روز نشد.</p></ErrorState>}
    <section className={styles.section} aria-labelledby="imports-list-title" aria-busy={loading}>
      <div className={styles.heading}><div><h2 id="imports-list-title">اسناد بارگذاری‌شده</h2></div><div className={styles.controls}>
        <SearchInput label="جستجوی سند" className="w-full sm:w-56" placeholder="جستجوی سند" value={search} onChange={(event) => setSearch(event.target.value)}  />
        <Select dir="rtl" value={status} onValueChange={setStatus}><SelectTrigger aria-label="وضعیت سند" icon={fieldIcon("وضعیت سند")} className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">همه وضعیت‌ها</SelectItem>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      </div></div>
      {failed ? <ErrorState onRetry={() => { setLoading(true); setRetry((value) => value + 1); }} variant="compact" ><p>فهرست اسناد دریافت نشد.</p></ErrorState> : <div className="min-w-0"><Table className="min-w-[640px]" containerClassName="border-0">
        <TableHeader><TableRow><TableHead scope="col">نام فایل</TableHead><TableHead scope="col">نوع سند</TableHead><TableHead scope="col">وضعیت</TableHead><TableHead scope="col">حجم فایل</TableHead><TableHead scope="col">تاریخ بارگذاری</TableHead></TableRow></TableHeader>
        <TableBody loading={loading}>{loading ? [0, 1, 2].map((row) => <TableRow key={row}>{[0, 1, 2, 3, 4].map((cell) => <TableCell key={cell}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>) : filtered.length ? filtered.map((item) => <TableRow key={item.id} onActivate={() => setSelectedId(item.id)}>
          <TableRowHeader scope="row"><Button variant="ghost" className="h-auto min-h-11 max-w-80 justify-start whitespace-normal px-0 text-start font-normal" onClick={() => { setError(""); setSelectedId(item.id); }}><bdi>{item.original_name}</bdi></Button></TableRowHeader>
          <TableCell>{sourceLabels[item.source_kind]}</TableCell><TableCell><StatusBadge status={item.status} label={statusLabels[item.status]} /></TableCell><TableCell>{formatBytes(item.size_bytes)}</TableCell><TableCell>{toJalaliDate(item.created_at.slice(0, 10))}</TableCell>
        </TableRow>) : <TableRow><TableEmptyCell colSpan={5} className="h-40 p-0 text-center text-muted-foreground">{search || status !== "all" ? "سندی با این جستجو و فیلتر پیدا نشد." : "هنوز سندی بارگذاری نشده است."}</TableEmptyCell></TableRow>}</TableBody>
      </Table></div>}
    </section>
    <Drawer size="wide" open={!!selected} onOpenChange={(open) => { if (!open && !deleting) setSelectedId(null); }} title={selected?.original_name ?? "جزئیات سند"}>
      {selected && <><DetailGroup>
        <DetailField icon={fieldIcon("نوع سند")} label="نوع سند">{sourceLabels[selected.source_kind]}</DetailField>
        <DetailField icon={fieldIcon("عنوان منبع")} label="عنوان منبع">{selected.source_label}</DetailField>
        <DetailField icon={fieldIcon("وضعیت")} label="وضعیت"><StatusBadge status={selected.status} label={statusLabels[selected.status]} /></DetailField>
        <DetailField icon={fieldIcon("حجم فایل")} label="حجم فایل">{formatBytes(selected.size_bytes)}</DetailField>
        <DetailField icon={fieldIcon("تاریخ بارگذاری")} label="تاریخ بارگذاری">{toJalaliDate(selected.created_at.slice(0, 10))}</DetailField>
        {selected.row_count != null && <DetailField icon={fieldIcon("تعداد ردیف‌ها")} label="تعداد ردیف‌ها">{toPersianDigits(selected.row_count)}</DetailField>}
      </DetailGroup>
        {pendingStatuses.includes(selected.status) && <LoadingState variant="inline" >در حال پردازش؛ {toPersianDigits(selected.progress)}٪.</LoadingState>}
        {selected.duplicate_detected && <p className={formStyles.caption}>فایل تکراری است.</p>}
        {selected.failure_message && <FormMessage>{selected.failure_message}</FormMessage>}
        {error && <FormMessage>{error}</FormMessage>}
        <DrawerFooter>
          {writable && <Button variant="outline" aria-label={`حذف ${selected.original_name}`} disabled={deleting} onClick={() => setDeleteTarget(selected)}><Trash2 size={16} aria-hidden="true" />حذف فایل</Button>}
          {selected.scan_status === "clean" && <Button variant="outline" asChild><a href={`${API_URL}/companies/${company.id}/imports/${selected.id}/download`}><Download size={16} aria-hidden="true" />دریافت فایل</a></Button>}
          {writable && (["uploaded", "inspecting", "awaiting_mapping"].includes(selected.status) || selected.retryable) && <Button onClick={() => { setWizardBatch(selected); setSelectedId(null); setCreating(true); }}>ادامه بارگذاری</Button>}
          {selected.scan_status === "clean" && <Button variant="outline" asChild><Link href={`/companies/${company.id}/imports/${selected.id}`}>مشاهده ردیف‌ها</Link></Button>}
          {(selected.status === "completed" || selected.status === "completed_limited") && <Button variant="outline" asChild><Link href={`/companies/${company.id}/findings`}>بررسی و پیگیری</Link></Button>}
        </DrawerFooter>
      </>}
    </Drawer>
    <Drawer size="wide" open={creating} onOpenChange={(open) => { if (!uploadBusy) setCreating(open); }} title="بارگذاری فایل">
      {creating && <UploadWizard key={wizardBatch?.id ?? "new"} company={company} initialBatch={wizardBatch} onSaving={setUploadBusy} onCancel={() => setCreating(false)} onUpdated={(batch) => {
        setItems((current) => [batch, ...current.filter((item) => item.id !== batch.id)]);
        setSearch(""); setStatus("all"); setFailed(false); setError("");
      }} onDone={(batch) => { setCreating(false); setUploadBusy(false); setSelectedId(batch.id); setNotice("سند ثبت شد و در صف پردازش و تطبیق قرار گرفت."); }} />}
    </Drawer>
    <ConfirmDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} title="حذف سند مالی" description={`آیا از حذف فایل «${deleteTarget?.original_name ?? ""}» مطمئن هستید؟ داده‌های وابسته به آن نیز حذف می‌شوند.`} busy={deleting} onConfirm={() => void deleteBatch()} />
  </div>;
}

