"use client";
import { SearchInput } from "@/components/ui/search-input";
import { DetailGroup, DetailField, fieldIcon, ControlLabel } from "@/components/ui/field-layout";
import { FormMessage } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/financial/status-badge";
import { EmptyState, ErrorState, LoadingState, PageHeader, toJalaliDate, toPersianDigits } from "@/components/ui/financial";

import { TableEmptyCell, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableRowHeader } from "@/components/ui/table";

import { useEffect, useState, useRef, type FormEvent } from "react";
import { API_URL, api } from "@/lib/product-api";
import type { AnalysisRun, Company, ReportSnapshot, ReportStatus } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerFooter, DrawerForm } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Download } from "@/components/ui/icons";
import pageStyles from "./cashflow-overview.module.css";
import styles from "./receivables-customers.module.css";

const statusLabels: Record<ReportStatus, string> = { queued: "در صف تولید", processing: "در حال تولید", completed: "آماده دریافت", failed: "تولید ناموفق" };
const normalize = (value: string) => value.replace(/ي/g, "ی").replace(/ك/g, "ک").trim().toLocaleLowerCase();
export function ReportsWorkspace({ company }: { company: Company }) {
  return <ReportsContent key={company.id} company={company} />;
}
function ReportsContent({ company }: { company: Company }) {
  const [reports, setReports] = useState<ReportSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [pollFailed, setPollFailed] = useState(false);
  const [pollRetry, setPollRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setFailed(false);
    api<ReportSnapshot[]>(`/companies/${company.id}/reports?limit=100`)
      .then((items) => { if (active) setReports(items); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [company.id, retry]);
  const pendingIds = reports.filter((report) => report.status === "queued" || report.status === "processing").map((report) => report.id).join(",");
  useEffect(() => {
    if (!pendingIds) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setPollFailed(false);
    async function poll() {
      try {
        const updated = await Promise.all(pendingIds.split(",").map((id) => api<ReportSnapshot>(`/companies/${company.id}/reports/${id}`)));
        if (!active) return;
        setReports((items) => items.map((item) => updated.find((report) => report.id === item.id) ?? item));
        if (updated.some((report) => report.status === "queued" || report.status === "processing")) timer = setTimeout(() => void poll(), 3000);
      } catch { if (active) setPollFailed(true); }
    }
    timer = setTimeout(() => void poll(), 3000);
    return () => { active = false; clearTimeout(timer); };
  }, [company.id, pendingIds, pollRetry]);
  const filtered = reports.filter((report) => normalize(report.title_fa).includes(normalize(search)) && (status === "all" || report.status === status));
  const selected = reports.find((report) => report.id === selectedId);
  const writable = !!company.role && ["owner", "finance_manager", "advisor"].includes(company.role);
  return <div dir="rtl" className={pageStyles.page}>
    <PageHeader title="گزارش‌ها" primaryAction={writable ? <Button variant="outline" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />گزارش جدید</Button> : undefined} />
    {pollFailed && <ErrorState onRetry={() => setPollRetry((value) => value + 1)} variant="compact" ><p>وضعیت تولید گزارش به‌روز نشد.</p></ErrorState>}
    <section className={styles.section} aria-labelledby="reports-list-title" aria-busy={loading}>
      <div className={styles.heading}><div><h2 id="reports-list-title">گزارش‌های ثبت‌شده</h2></div><div className={styles.controls}>
        <SearchInput label="جستجوی گزارش" className="w-full sm:w-56" placeholder="جستجوی گزارش" value={search} onChange={(event) => setSearch(event.target.value)}  />
        <Select dir="rtl" value={status} onValueChange={setStatus}><SelectTrigger aria-label="وضعیت گزارش" icon={fieldIcon("وضعیت گزارش")} className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">همه وضعیت‌ها</SelectItem>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      </div></div>
      {failed ? <ErrorState onRetry={() => setRetry((value) => value + 1)} variant="compact" ><p>گزارش‌ها دریافت نشدند.</p></ErrorState> : <div className="min-w-0"><Table className="min-w-[640px]" containerClassName="border-0">
        <TableHeader><TableRow><TableHead scope="col">عنوان گزارش</TableHead><TableHead scope="col">دوره گزارش</TableHead><TableHead scope="col">وضعیت</TableHead><TableHead scope="col">تاریخ ایجاد</TableHead></TableRow></TableHeader>
        <TableBody loading={loading}>{loading ? [0, 1, 2].map((row) => <TableRow key={row}>{[0, 1, 2, 3].map((cell) => <TableCell key={cell}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>) : filtered.length ? filtered.map((report) => <TableRow key={report.id} onActivate={() => setSelectedId(report.id)}>
          <TableRowHeader scope="row"><Button variant="ghost" className="h-auto min-h-11 max-w-80 justify-start whitespace-normal px-0 text-start font-normal" onClick={() => setSelectedId(report.id)}>{report.title_fa}</Button></TableRowHeader>
          <TableCell>{toJalaliDate(report.period_start)} تا {toJalaliDate(report.period_end)}</TableCell><TableCell><StatusBadge status={report.status} label={statusLabels[report.status]} /></TableCell><TableCell>{toJalaliDate(report.created_at.slice(0, 10))}</TableCell>
        </TableRow>) : <TableRow><TableEmptyCell colSpan={4} className="h-40 p-0 text-center text-muted-foreground">{search || status !== "all" ? "گزارشی با این جستجو و فیلتر پیدا نشد." : "هنوز گزارشی ساخته نشده است."}</TableEmptyCell></TableRow>}</TableBody>
      </Table></div>}
    </section>
    <Drawer size="wide" open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }} title={selected?.title_fa ?? "جزئیات گزارش"}>
      {selected && <><DetailGroup><DetailField icon={fieldIcon("دوره گزارش")} label="دوره گزارش">{toJalaliDate(selected.period_start)} تا {toJalaliDate(selected.period_end)}</DetailField><DetailField icon={fieldIcon("وضعیت")} label="وضعیت"><StatusBadge status={selected.status} label={statusLabels[selected.status]} /></DetailField><DetailField icon={fieldIcon("تاریخ ایجاد")} label="تاریخ ایجاد">{toJalaliDate(selected.created_at.slice(0, 10))}</DetailField></DetailGroup>
        {selected.status === "processing" && <LoadingState variant="inline" >در حال تولید گزارش؛ {toPersianDigits(selected.progress)}٪</LoadingState>}
        {selected.status === "queued" && <LoadingState variant="inline" >در صف تولید</LoadingState>}
        {selected.status === "failed" && <FormMessage>{selected.failure_message ?? "تولید گزارش ناموفق بود. می‌توانید گزارش جدیدی بسازید."}</FormMessage>}
        {selected.payload.overall_status?.summary_fa && <DetailGroup><DetailField icon={fieldIcon("خلاصه گزارش")} label="خلاصه گزارش">{selected.payload.overall_status.summary_fa}</DetailField></DetailGroup>}
        {selected.advisor_note && <DetailGroup><DetailField icon={fieldIcon("یادداشت گزارش")} label="یادداشت گزارش">{selected.advisor_note}</DetailField></DetailGroup>}
        {selected.status === "completed" && selected.download_ready && <DrawerFooter><Button asChild><a href={`${API_URL}/companies/${company.id}/reports/${selected.id}/download`}><Download size={16} aria-hidden="true" />دریافت PDF</a></Button></DrawerFooter>}
      </>}
    </Drawer>
    <Drawer size="wide" open={creating} onOpenChange={(open) => { if (!formBusy) setCreating(open); }} title="گزارش جدید">
      {creating && <ReportForm companyId={company.id} onSaving={setFormBusy} onCancel={() => setCreating(false)} onCreated={(report) => { setReports((items) => [report, ...items.filter((item) => item.id !== report.id)]); setSearch(""); setStatus("all"); setFormBusy(false); setCreating(false); setSelectedId(report.id); }} />}
    </Drawer>
  </div>;
}
export function ReportForm({ companyId, onCancel, onCreated, onSaving, request = api }: { request?: typeof api; companyId: string; onSaving: (saving: boolean) => void; onCancel: () => void; onCreated: (report: ReportSnapshot) => void }) {
  const [analyses, setAnalyses] = useState<AnalysisRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [analysisId, setAnalysisId] = useState("");
  const [title, setTitle] = useState("گزارش بررسی مالی");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requestKey = useRef<{ body: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setFailed(false);
    request<AnalysisRun[]>(`/companies/${companyId}/analysis-runs?limit=30`).then((items) => {
      if (!active) return;
      const ready = items.filter((item) => item.status === "completed" || item.status === "completed_limited");
      setAnalyses(ready); setAnalysisId(ready[0]?.id ?? "");
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, retry, request]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!analysisId || !title.trim() || saving) return;
    setSaving(true); onSaving(true); setError("");
    const body = JSON.stringify({ analysis_run_id: analysisId, title_fa: title.trim(), advisor_note: note.trim() || null });
    if (requestKey.current?.body !== body) requestKey.current = { body, key: crypto.randomUUID() };
    try {
      const report = await request<ReportSnapshot>(`/companies/${companyId}/reports`, { method: "POST", headers: { "Idempotency-Key": requestKey.current.key }, body });
      onCreated(report);
    } catch { setError("درخواست گزارش ثبت نشد. دوباره تلاش کنید."); setSaving(false); onSaving(false); }
  }
  if (loading) return <LoadingState variant="details" rows={1} />;
  if (failed) return <ErrorState onRetry={() => setRetry((value) => value + 1)} variant="compact" ><p>تحلیل‌های مبنا دریافت نشدند.</p></ErrorState>;
  if (!analyses.length) return <EmptyState variant="inline">تحلیل تکمیل‌شده‌ای موجود نیست.</EmptyState>;
  return <DrawerForm onSubmit={(event) => void save(event)}>
    <div><ControlLabel htmlFor="report-title" icon={fieldIcon("عنوان گزارش")}>عنوان گزارش</ControlLabel><Input id="report-title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} disabled={saving} /></div>
    <div><ControlLabel htmlFor="report-analysis" icon={fieldIcon("تحلیل مبنا")}>تحلیل مبنا</ControlLabel><Select dir="rtl" value={analysisId} onValueChange={setAnalysisId} disabled={saving}><SelectTrigger id="report-analysis"><SelectValue /></SelectTrigger><SelectContent>{analyses.map((analysis) => <SelectItem key={analysis.id} value={analysis.id}>{toJalaliDate(analysis.period_start)} تا {toJalaliDate(analysis.period_end)}{analysis.status === "completed_limited" ? " (پوشش محدود)" : ""}</SelectItem>)}</SelectContent></Select></div>
    <div><ControlLabel htmlFor="report-note" icon={fieldIcon("یادداشت (اختیاری)")}>یادداشت (اختیاری)</ControlLabel><Textarea id="report-note" maxLength={4000} rows={5} value={note} onChange={(event) => setNote(event.target.value)} disabled={saving} /></div>
    {error && <FormMessage>{error}</FormMessage>}
    <DrawerFooter><Button type="button" variant="outline" onClick={onCancel} disabled={saving}>انصراف</Button><Button type="submit" disabled={saving || !title.trim()}>{saving ? "در حال ثبت…" : "ساخت گزارش"}</Button></DrawerFooter>
  </DrawerForm>;
}
