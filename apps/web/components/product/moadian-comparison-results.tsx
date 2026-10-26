"use client";
import { DetailGroup, DetailField, fieldIcon } from "@/components/ui/field-layout";
import { ComparisonReviewForm } from "./comparison-review-form";
import { ComparisonProvenance } from "./comparison-provenance";
import { Badge } from "@/components/ui/badge";
import { LoadingState, StatusMessage, EmptyState, toJalaliDate, toPersianDigits } from "@/components/ui/financial";

import { Table, TableCaption, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay } from "@/components/ui/financial/money-display";
import { comparisonLabels, type ComparisonItem, type ComparisonReport } from "@/lib/moadian";
import type { ImportBatch } from "@/lib/product-types";
import { AlertTriangle, CheckCircle, FileText, ScanSearch } from "@/components/ui/icons";

const statusVariants = {
  matched: "success",
  difference: "danger",
  suggested: "warning",
  review: "warning",
  internal_only: "secondary",
  portal_only: "secondary",
} as const;

function ComparisonStatusLabel({ item }: { item: ComparisonItem }) {
  const Icon = item.status === "matched" ? CheckCircle : item.status === "difference" ? AlertTriangle : item.status === "review" || item.status === "suggested" ? ScanSearch : FileText;
  return <span className="inline-flex flex-wrap gap-1"><Badge variant={statusVariants[item.status]} size="sm"><Icon size={14} aria-hidden="true" />{comparisonLabels[item.status]}</Badge>{item.decision === "resolved" && <Badge variant="secondary">رسیدگی‌شده</Badge>}</span>;
}

export function MoadianComparisonResults({ report, loading, onInspect, onPage, pageSize = 25, offset = report?.offset ?? 0, total = report?.total ?? 0, onPageSizeChange }: {
  report: ComparisonReport | null; loading: boolean; onInspect: (item: ComparisonItem) => void; onPage: (offset: number) => void; pageSize?: number; offset?: number; total?: number; onPageSizeChange?: (size: number) => void;
}) {
  const pagination = <TablePagination total={total} page={Math.floor(offset / pageSize)} pageSize={pageSize} loading={loading} onPageChange={(page) => onPage(page * pageSize)} onPageSizeChange={onPageSizeChange} />;
  if (loading) return <div className="space-y-4"><LoadingState aria-label="در حال تطبیق" aria-busy="true" variant="details"><Skeleton className="h-12 w-full" />{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</LoadingState>{pagination}</div>;
  if (!report) return null;
  return <section aria-label="نتیجه تطبیق" className="space-y-4 motion-safe:animate-[workspace-enter_180ms_ease-out_both]">
    {report.coverage && (["internal", "portal"] as const).map((side) => !report.coverage![side].complete && <StatusMessage key={side} tone="warning">{side === "internal" ? "حسابداری" : "مؤدیان"}: {report.coverage![side].reasons.join(" ")}</StatusMessage>)}
    {!!report.overlapping_copies && <StatusMessage>{toPersianDigits(report.overlapping_copies)} نسخه تکراری بین فایل‌ها یک‌بار مقایسه شد.</StatusMessage>}
    {report.rejected_rows > 0 && <StatusMessage tone="warning" >{toPersianDigits(report.rejected_rows)} ردیف نامعتبر از فایل‌ها در تطبیق وارد نشده است.</StatusMessage>}
    <div className="space-y-3 md:hidden">{report.items.map((item) => <article key={`${item.internal?.row_id ?? ""}:${item.portal?.row_id ?? ""}`} className="space-y-4 rounded-[var(--ds-card-radius)] border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div dir="ltr" className="max-w-56 truncate font-mono text-sm">{item.internal?.invoice_no || item.portal?.invoice_no || item.portal?.tax_id || item.internal?.tax_id || "—"}</div><p className="mt-1 text-sm">{item.internal?.party_name || item.portal?.party_name || "—"}</p></div><ComparisonStatusLabel item={item} /></div>
      <dl className="grid grid-cols-2 gap-3 text-sm"><DetailField icon={fieldIcon("حسابداری (ریال)")} label="حسابداری (ریال)"><MoneyDisplay amount={item.internal?.gross_amount} currency="" direction="neutral" /></DetailField><DetailField icon={fieldIcon("کارپوشه (ریال)")} label="کارپوشه (ریال)"><MoneyDisplay amount={item.portal?.gross_amount} currency="" direction="neutral" /></DetailField></dl>
      {item.differences.length > 0 && <p className="text-xs text-destructive">{item.differences.join("، ")}</p>}{item.limitations.length > 0 && <p className="text-xs text-muted-foreground">{item.limitations[0]}</p>}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-2"><span className="text-xs text-muted-foreground">{toJalaliDate((item.internal || item.portal)!.issue_date)}</span><Button variant="ghost" onClick={() => onInspect(item)} aria-label={`جزئیات فاکتور ${item.internal?.invoice_no || item.portal?.tax_id || ""}`}>مشاهده جزئیات</Button></div>
    </article>)}</div>
    <div className="hidden min-w-0 md:block">
      <Table className="min-w-[760px]" containerClassName="border-0"><TableCaption className="sr-only">مقایسه فاکتورهای فایل حسابداری و کارپوشه؛ مبالغ به ریال</TableCaption>
        <TableHeader className="bg-muted text-muted-foreground"><TableRow>{["فاکتور / طرف معامله", "تاریخ", "حسابداری (ریال)", "کارپوشه (ریال)", "نتیجه", "جزئیات"].map((h) => <TableHead scope="col" className="px-4 py-3 text-start font-medium" key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{report.items.map((item) => <TableRow key={`${item.internal?.row_id ?? ""}:${item.portal?.row_id ?? ""}`} onActivate={() => onInspect(item)} className="border-t border-border transition-colors hover:bg-muted/40 motion-reduce:transition-none">
          <TableCell className="max-w-64 px-4 py-3"><div dir="ltr" className="truncate text-start font-mono">{item.internal?.invoice_no || item.portal?.invoice_no || item.portal?.tax_id || item.internal?.tax_id || "—"}</div><div className="mt-1 truncate text-muted-foreground">{item.internal?.party_name || item.portal?.party_name || "—"}</div></TableCell>
          <TableCell className="whitespace-nowrap px-4 py-3">{toJalaliDate((item.internal || item.portal)!.issue_date)}</TableCell>
          <TableCell className="px-4 py-3"><MoneyDisplay amount={item.internal?.gross_amount} currency="" direction="neutral" /></TableCell>
          <TableCell className="px-4 py-3"><MoneyDisplay amount={item.portal?.gross_amount} currency="" direction="neutral" /></TableCell>
          <TableCell className="px-4 py-3"><ComparisonStatusLabel item={item} />{item.differences.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{item.differences.join("، ")}</p>}{item.limitations.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{item.limitations[0]}</p>}</TableCell>
          <TableCell className="px-4 py-3"><Button variant="ghost" aria-label={`جزئیات فاکتور ${item.internal?.invoice_no || item.portal?.tax_id || ""}`} onClick={() => onInspect(item)}>مشاهده</Button></TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>
    {report.total === 0 && <EmptyState variant="compact" ><ScanSearch size={28} className="text-muted-foreground" aria-hidden="true" /><p className="text-sm">فاکتوری در این بازه و فیلتر نیست.</p></EmptyState>}
    {pagination}
  </section>;
}

export function MoadianComparisonDetails({ item, batches, onClose, writable = false, busy = false, error = "", onSave }: {
  item: ComparisonItem | null; batches: ImportBatch[]; onClose: () => void;
  writable?: boolean; busy?: boolean; error?: string; onSave?: (note: string, decision: "open" | "resolved") => void;
}) {
  return <Drawer closeDisabled={busy} size="wide" open={!!item} onOpenChange={(open) => { if (!open) onClose(); }} title="جزئیات تطبیق">
    {item && <><div className="flex"><ComparisonStatusLabel item={item} /></div>{item.reason && <p className="text-sm">{item.reason}</p>}{item.limitations.map((text) => <p key={text} className="text-sm text-muted-foreground">{text}</p>)}
      <div className="grid min-w-0 gap-7 sm:grid-cols-2">{[{ title: "فایل حسابداری", invoice: item.internal }, { title: "فایل کارپوشه", invoice: item.portal }].map(({ title, invoice }) => <section key={title} className="grid min-w-0 content-start gap-5"><h3 className="font-medium">{title}</h3>{invoice ? <DetailGroup className="sm:grid-cols-1">
        <DetailField icon={fieldIcon("فایل")} label="فایل">{batches.find((b) => b.id === invoice.batch_id)?.original_name}</DetailField>
        <DetailField icon={fieldIcon("شیت / ردیف")} label="شیت / ردیف">{invoice.sheet} / {toPersianDigits(invoice.row_number)}</DetailField>
        <DetailField icon={fieldIcon("شماره مالیاتی")} label="شماره مالیاتی">{invoice.tax_id || "—"}</DetailField>
        <DetailField icon={fieldIcon("شماره فاکتور")} label="شماره فاکتور">{invoice.invoice_no || "—"}</DetailField>
        <DetailField icon={fieldIcon("طرف معامله")} label="طرف معامله">{invoice.party_name || "—"}</DetailField>
        <DetailField icon={fieldIcon("شناسه طرف معامله")} label="شناسه طرف معامله">{invoice.party_id || "—"}</DetailField>
        <DetailField icon={fieldIcon("تاریخ")} label="تاریخ">{toJalaliDate(invoice.issue_date)}</DetailField>
        <DetailField icon={fieldIcon("مبلغ کل")} label="مبلغ کل"><MoneyDisplay amount={invoice.gross_amount} currency="ریال" direction="neutral" /></DetailField>
        <DetailField icon={fieldIcon("مالیات")} label="مالیات"><MoneyDisplay amount={invoice.tax_amount} currency="ریال" direction="neutral" /></DetailField>
        <DetailField icon={fieldIcon("موضوع / وضعیت")} label="موضوع / وضعیت">{invoice.subject || "—"} / {invoice.status || "—"}</DetailField>
        <DetailField icon={fieldIcon("شماره مالیاتی مرجع")} label="شماره مالیاتی مرجع">{invoice.reference_tax_id || "—"}</DetailField>
      </DetailGroup> : <EmptyState variant="inline">فاکتور متناظر در فایل‌های انتخاب‌شده پیدا نشد.</EmptyState>}{invoice && <ComparisonProvenance key={invoice.row_id} invoice={invoice} batches={batches} />}</section>)}</div>
      {!!item.related_documents?.length && <section className="grid gap-3 border-t border-border pt-5"><h3 className="font-medium">اسناد مرتبط با اصلاح یا ابطال</h3><Table className="min-w-0 table-fixed"><TableHeader><TableRow><TableHead>شماره مالیاتی</TableHead><TableHead>موضوع / وضعیت</TableHead></TableRow></TableHeader><TableBody>{item.related_documents.map((document) => <TableRow key={document.row_id}><TableCell className="whitespace-normal break-all" dir="ltr">{document.tax_id}</TableCell><TableCell className="whitespace-normal">{document.subject || "—"} / {document.status || "—"}</TableCell></TableRow>)}</TableBody></Table></section>}
      {writable && onSave && item.key ? <ComparisonReviewForm key={item.key} item={item} busy={busy} error={error} onSave={onSave} /> : item.note && <StatusMessage>{item.decision === "resolved" ? "رسیدگی‌شده" : "در حال پیگیری"}: {item.note}</StatusMessage>}
    </>}
  </Drawer>;
}
