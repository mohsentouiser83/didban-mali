"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/product-api";
import { toman } from "@/lib/cashflow-amounts";
import type { Company, FindingStatus, FindingDetectionRun } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay, PageHeader, toJalaliDate, toPersianDigits } from "@/components/ui/financial";
import { Search, ChevronLeft, RefreshCcw } from "@/components/ui/icons";
import pageStyles from "./cashflow-overview.module.css";
import styles from "./receivables-customers.module.css";

export const reviewStatusLabels: Record<FindingStatus, string> = { new: "نیازمند بررسی", triaged: "بررسی اولیه", in_progress: "در حال پیگیری", reopened: "بازگشایی‌شده", resolved: "حل‌شده", verified: "تأیید نهایی", dismissed: "ردشده" };
const severityLabels: Record<string, string> = { critical: "بحرانی", high: "بالا", medium: "متوسط", low: "کم" };
export type ReviewItem = { id: string; title_fa: string; summary_fa: string; status: FindingStatus; severity: string; affected_amount_irr: string | null; assigned_to_name: string | null; due_date: string | null };
type ReviewList = { items: ReviewItem[]; total_count: number };
const pageSize = 25;
export function ReviewWorkspace({ company }: { company: Company }) {
  return <ReviewContent key={company.id} company={company} />;
}
function ReviewContent({ company }: { company: Company }) {
  const [list, setList] = useState<ReviewList | null>(null);
  const [loading, setLoading] = useState(true);
  const [listFailed, setListFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<ReviewItem | null>(null);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  const [runFailed, setRunFailed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(0); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    setLoading(true); setList(null); setListFailed(false);
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
    if (query) params.set("search", query);
    if (status !== "all") params.set("status", status);
    api<ReviewList>(`/companies/${company.id}/findings?${params}`).then((result) => { if (active) setList(result); }).catch(() => { if (active) setListFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [company.id, query, status, page, retry]);
  async function detect() {
    setRunning(true); setRunMessage(""); setRunFailed(false);
    try {
      const result = await api<FindingDetectionRun>(`/companies/${company.id}/findings/detect`, { method: "POST", body: JSON.stringify({ trigger_type: "manual" }) });
      if (result.status === "failed") throw Error("Detection failed");
      setRunMessage(`بررسی انجام شد؛ ${toPersianDigits(result.findings_detected)} مورد ارزیابی شد.`); setPage(0); setRetry((value) => value + 1);
    } catch { setRunFailed(true); setRunMessage("بررسی انجام نشد. دوباره تلاش کنید."); }
    finally { setRunning(false); }
  }
  return <div dir="rtl" className={pageStyles.page}>
    <PageHeader title="بررسی و پیگیری" primaryAction={company.role && ["owner", "finance_manager", "advisor"].includes(company.role) ? <Button variant="outline" disabled={running} onClick={() => void detect()}><RefreshCcw size={16} aria-hidden="true" />{running ? "در حال بررسی…" : "بررسی دوباره"}</Button> : undefined} />
    {runMessage && <p className={pageStyles.period} role={runFailed ? "alert" : "status"}>{runMessage}</p>}
    <section className={styles.section} aria-labelledby="review-list-title" aria-busy={loading}>
      <div className={styles.heading}><div><h2 id="review-list-title">موارد قابل بررسی</h2><p>موارد بحرانی و با اهمیت بالا در ابتدای فهرست</p></div><div className={styles.controls}>
        <div className={styles.search}><Search size={17} aria-hidden="true" /><Input aria-label="جستجوی مورد" placeholder="جستجوی مورد" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <Select dir="rtl" value={status} onValueChange={(value) => { setStatus(value); setPage(0); }}><SelectTrigger aria-label="وضعیت بررسی" className="w-40 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">همه وضعیت‌ها</SelectItem>{Object.entries(reviewStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      </div></div>
      {listFailed ? <div role="alert" className={styles.empty}><p>فهرست موارد دریافت نشد.</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>تلاش دوباره</Button></div> : <><div className={styles.scroll}><table className={styles.table}>
        <thead><tr><th scope="col">موضوع</th><th scope="col">اهمیت</th><th scope="col">وضعیت</th><th scope="col">مسئول پیگیری</th><th scope="col">موعد پیگیری</th></tr></thead>
        <tbody>{loading ? [0, 1, 2].map((row) => <tr key={row}>{[0, 1, 2, 3, 4].map((cell) => <td key={cell}><Skeleton className="h-5 w-full" /></td>)}</tr>) : list?.items.length ? list.items.map((item) => <tr key={item.id}>
          <th scope="row"><Button variant="ghost" className={styles.customer} onClick={() => setSelected(item)}>{item.title_fa}<ChevronLeft size={16} aria-hidden="true" /></Button></th><td>{severityLabels[item.severity] ?? item.severity}</td><td>{reviewStatusLabels[item.status] ?? "نامشخص"}</td><td>{item.assigned_to_name ?? "تعیین نشده"}</td><td>{item.due_date ? toJalaliDate(item.due_date) : "تعیین نشده"}</td>
        </tr>) : <tr><td colSpan={5} className={styles.empty}>{query || status !== "all" ? "موردی با این جستجو و فیلتر پیدا نشد." : "هنوز موردی برای بررسی ثبت نشده است."}</td></tr>}</tbody>
      </table></div>{list && list.total_count > pageSize && <div className={styles.heading}><Button variant="outline" disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}>قبلی</Button><span className="text-xs text-muted-foreground">صفحه {toPersianDigits(page + 1)} از {toPersianDigits(Math.ceil(list.total_count / pageSize))}</span><Button variant="outline" disabled={(page + 1) * pageSize >= list.total_count || loading} onClick={() => setPage((value) => value + 1)}>بعدی</Button></div>}</>}
    </section>
    <Drawer open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }} title={selected?.title_fa ?? "جزئیات مورد"} description="خلاصه، وضعیت و شواهد بررسی">
      {selected && <ReviewPreview key={selected.id} companyId={company.id} item={selected} />}
    </Drawer>
  </div>;
}

type Preview = { summary_fa: string; status: FindingStatus; financial_impact_irr: string | null; assigned_to_name: string | null; due_date: string | null; evidence: { id: string; title_fa: string; description_fa: string }[] };
function ReviewPreview({ companyId, item }: { companyId: string; item: ReviewItem }) {
  const [detail, setDetail] = useState<Preview | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setFailed(false); setDetail(null);
    api<Preview>(`/companies/${companyId}/findings/${item.id}`).then((result) => { if (active) setDetail(result); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [companyId, item.id, retry]);
  return <>
    {failed ? <div role="alert"><p>جزئیات دریافت نشد.</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>تلاش دوباره</Button></div> : !detail ? <Skeleton className="h-32 w-full" /> : <div className={styles.invoices}>
      <p className="text-sm leading-8">{detail.summary_fa}</p>
      <dl className="grid gap-3 text-xs"><div className="flex justify-between gap-3"><dt>وضعیت</dt><dd>{reviewStatusLabels[detail.status] ?? "نامشخص"}</dd></div><div className="flex justify-between gap-3"><dt>مسئول پیگیری</dt><dd>{detail.assigned_to_name ?? "تعیین نشده"}</dd></div><div className="flex justify-between gap-3"><dt>موعد پیگیری</dt><dd>{detail.due_date ? toJalaliDate(detail.due_date) : "تعیین نشده"}</dd></div>
        <div className="flex justify-between gap-3"><dt>مبلغ مرتبط</dt><dd>{detail.financial_impact_irr !== null ? <MoneyDisplay amount={toman(detail.financial_impact_irr)} currency="تومان" size="sm" direction="neutral" /> : "مشخص نیست"}</dd></div></dl>
      <h3 className="text-sm font-medium">شواهد</h3>
      {detail.evidence.length ? detail.evidence.map((evidence) => <article className={styles.invoice} key={evidence.id}><h4 className="text-sm font-medium">{evidence.title_fa}</h4><p className="text-xs leading-7 text-muted-foreground">{evidence.description_fa}</p></article>) : <p className="text-xs text-muted-foreground">شاهدی برای این مورد ثبت نشده است.</p>}
    </div>}
    <Button asChild variant="outline"><Link href={`/companies/${companyId}/findings/${item.id}`}>باز کردن پرونده و ثبت پیگیری</Link></Button>
  </>;
}
