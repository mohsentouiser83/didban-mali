"use client";

import { useEffect, useState, useRef, type FormEvent } from "react";
import { API_URL, api } from "@/lib/product-api";
import type { AnalysisRun, Company, ReportSnapshot, ReportStatus } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, toJalaliDate, toPersianDigits } from "@/components/ui/financial";
import { Search, ChevronLeft, Plus, Download } from "@/components/ui/icons";
import pageStyles from "./cashflow-overview.module.css";
import styles from "./receivables-customers.module.css";
import reportStyles from "./reports-workspace.module.css";

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
    {pollFailed && <div role="alert" className={pageStyles.error}><p>وضعیت تولید گزارش به‌روز نشد.</p><Button variant="outline" onClick={() => setPollRetry((value) => value + 1)}>تلاش دوباره</Button></div>}
    <section className={styles.section} aria-labelledby="reports-list-title" aria-busy={loading}>
      <div className={styles.heading}><div><h2 id="reports-list-title">گزارش‌های ثبت‌شده</h2><p>{reports.length === 100 ? "۱۰۰ گزارش اخیر، از جدیدترین به قدیمی‌ترین" : "از جدیدترین به قدیمی‌ترین"}</p></div><div className={styles.controls}>
        <div className={styles.search}><Search size={17} aria-hidden="true" /><Input aria-label="جستجوی گزارش" placeholder="جستجوی گزارش" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <Select dir="rtl" value={status} onValueChange={setStatus}><SelectTrigger aria-label="وضعیت گزارش" className="w-40 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">همه وضعیت‌ها</SelectItem>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      </div></div>
      {failed ? <div role="alert" className={styles.empty}><p>گزارش‌ها دریافت نشدند.</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>تلاش دوباره</Button></div> : <div className={styles.scroll}><table className={styles.table}>
        <thead><tr><th scope="col">عنوان گزارش</th><th scope="col">دوره گزارش</th><th scope="col">وضعیت</th><th scope="col">تاریخ ایجاد</th></tr></thead>
        <tbody>{loading ? [0, 1, 2].map((row) => <tr key={row}>{[0, 1, 2, 3].map((cell) => <td key={cell}><Skeleton className="h-5 w-full" /></td>)}</tr>) : filtered.length ? filtered.map((report) => <tr key={report.id}>
          <th scope="row"><Button variant="ghost" className={styles.customer} onClick={() => setSelectedId(report.id)}>{report.title_fa}<ChevronLeft size={16} aria-hidden="true" /></Button></th>
          <td>{toJalaliDate(report.period_start)} تا {toJalaliDate(report.period_end)}</td><td>{statusLabels[report.status]}</td><td>{toJalaliDate(report.created_at.slice(0, 10))}</td>
        </tr>) : <tr><td colSpan={4} className={styles.empty}>{search || status !== "all" ? "گزارشی با این جستجو و فیلتر پیدا نشد." : "هنوز گزارشی ساخته نشده است."}</td></tr>}</tbody>
      </table></div>}
    </section>
    <Drawer open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }} title={selected?.title_fa ?? "جزئیات گزارش"} description="دوره، وضعیت تولید و دریافت PDF">
      {selected && <><dl className={reportStyles.details}><div><dt>دوره گزارش</dt><dd>{toJalaliDate(selected.period_start)} تا {toJalaliDate(selected.period_end)}</dd></div><div><dt>وضعیت</dt><dd>{statusLabels[selected.status]}</dd></div><div><dt>تاریخ ایجاد</dt><dd>{toJalaliDate(selected.created_at.slice(0, 10))}</dd></div></dl>
        {selected.status === "processing" && <p role="status" className={reportStyles.caption}>در حال تولید گزارش؛ {toPersianDigits(selected.progress)}٪</p>}
        {selected.status === "queued" && <p role="status" className={reportStyles.caption}>گزارش در صف تولید است. وضعیت به‌صورت خودکار به‌روز می‌شود.</p>}
        {selected.status === "failed" && <p role="alert" className={reportStyles.error}>{selected.failure_message ?? "تولید گزارش ناموفق بود. می‌توانید گزارش جدیدی بسازید."}</p>}
        {selected.payload.overall_status?.summary_fa && <div><h3 className={reportStyles.subtitle}>خلاصه گزارش</h3><p className={reportStyles.caption}>{selected.payload.overall_status.summary_fa}</p></div>}
        {selected.advisor_note && <div><h3 className={reportStyles.subtitle}>یادداشت گزارش</h3><p className={reportStyles.note}>{selected.advisor_note}</p></div>}
        {selected.status === "completed" && selected.download_ready && <DrawerFooter><Button asChild><a href={`${API_URL}/companies/${company.id}/reports/${selected.id}/download`}><Download size={16} aria-hidden="true" />دریافت PDF</a></Button></DrawerFooter>}
      </>}
    </Drawer>
    <Drawer open={creating} onOpenChange={(open) => { if (!formBusy) setCreating(open); }} title="گزارش جدید" description="تحلیل مبنا را انتخاب کنید و گزارش PDF بسازید.">
      {creating && <ReportForm companyId={company.id} onSaving={setFormBusy} onCancel={() => setCreating(false)} onCreated={(report) => { setReports((items) => [report, ...items.filter((item) => item.id !== report.id)]); setSearch(""); setStatus("all"); setFormBusy(false); setCreating(false); setSelectedId(report.id); }} />}
    </Drawer>
  </div>;
}
function ReportForm({ companyId, onCancel, onCreated, onSaving }: { companyId: string; onSaving: (saving: boolean) => void; onCancel: () => void; onCreated: (report: ReportSnapshot) => void }) {
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
    api<AnalysisRun[]>(`/companies/${companyId}/analysis-runs?limit=30`).then((items) => {
      if (!active) return;
      const ready = items.filter((item) => item.status === "completed" || item.status === "completed_limited");
      setAnalyses(ready); setAnalysisId(ready[0]?.id ?? "");
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, retry]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!analysisId || !title.trim() || saving) return;
    setSaving(true); onSaving(true); setError("");
    const body = JSON.stringify({ analysis_run_id: analysisId, title_fa: title.trim(), advisor_note: note.trim() || null });
    if (requestKey.current?.body !== body) requestKey.current = { body, key: crypto.randomUUID() };
    try {
      const report = await api<ReportSnapshot>(`/companies/${companyId}/reports`, { method: "POST", headers: { "Idempotency-Key": requestKey.current.key }, body });
      onCreated(report);
    } catch { setError("درخواست گزارش ثبت نشد. دوباره تلاش کنید."); setSaving(false); onSaving(false); }
  }
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (failed) return <div role="alert" className={reportStyles.caption}><p>تحلیل‌های مبنا دریافت نشدند.</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>تلاش دوباره</Button></div>;
  if (!analyses.length) return <p className={reportStyles.caption}>برای ساخت گزارش، ابتدا باید یک تحلیل تکمیل‌شده داشته باشید.</p>;
  return <form className={reportStyles.form} onSubmit={(event) => void save(event)}>
    <div><label htmlFor="report-title">عنوان گزارش</label><Input id="report-title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} disabled={saving} /></div>
    <div><label htmlFor="report-analysis">دوره تحلیل</label><Select dir="rtl" value={analysisId} onValueChange={setAnalysisId} disabled={saving}><SelectTrigger id="report-analysis"><SelectValue /></SelectTrigger><SelectContent>{analyses.map((analysis) => <SelectItem key={analysis.id} value={analysis.id}>{toJalaliDate(analysis.period_start)} تا {toJalaliDate(analysis.period_end)}{analysis.status === "completed_limited" ? " (پوشش محدود)" : ""}</SelectItem>)}</SelectContent></Select></div>
    <div><label htmlFor="report-note">یادداشت (اختیاری)</label><Textarea id="report-note" maxLength={4000} rows={5} value={note} onChange={(event) => setNote(event.target.value)} disabled={saving} /></div>
    {error && <p role="alert" className={reportStyles.error}>{error}</p>}
    <DrawerFooter><Button type="button" variant="outline" onClick={onCancel} disabled={saving}>انصراف</Button><Button type="submit" disabled={saving || !title.trim()}>{saving ? "در حال ثبت…" : "ساخت گزارش"}</Button></DrawerFooter>
  </form>;
}
