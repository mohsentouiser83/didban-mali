"use client";
import { Badge } from "@/components/ui/badge";
import { LoadingState, StatusMessage, EmptyState, toJalaliDate, toPersianDigits } from "@/components/ui/financial";

import { Table, TableCaption, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerDetails } from "@/components/ui/drawer";
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
  return <Badge variant={statusVariants[item.status]} size="sm"><Icon size={14} aria-hidden="true" />{comparisonLabels[item.status]}</Badge>;
}

export function MoadianComparisonResults({ report, loading, onInspect, onPage }: {
  report: ComparisonReport | null; loading: boolean; onInspect: (item: ComparisonItem) => void; onPage: (offset: number) => void;
}) {
  if (loading) return <LoadingState aria-label="در حال تطبیق" aria-busy="true" variant="details"><Skeleton className="h-12 w-full" />{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</LoadingState>;
  if (!report) return null;
  return <section aria-label="نتیجه تطبیق" className="space-y-4 motion-safe:animate-[workspace-enter_180ms_ease-out_both]">
    {report.rejected_rows > 0 && <StatusMessage tone="warning" >{toPersianDigits(report.rejected_rows)} ردیف نامعتبر از فایل‌ها در تطبیق وارد نشده است.</StatusMessage>}
    <div className="space-y-3 md:hidden">{report.items.map((item) => <article key={`${item.internal?.row_id ?? ""}:${item.portal?.row_id ?? ""}`} className="space-y-4 rounded-[var(--ds-card-radius)] border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div dir="ltr" className="max-w-56 truncate font-mono text-sm">{item.internal?.invoice_no || item.portal?.invoice_no || item.portal?.tax_id || item.internal?.tax_id || "—"}</div><p className="mt-1 text-sm">{item.internal?.party_name || item.portal?.party_name || "—"}</p></div><ComparisonStatusLabel item={item} /></div>
      <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="mb-1 text-xs text-muted-foreground">حسابداری (ریال)</dt><dd><MoneyDisplay amount={item.internal?.gross_amount} currency="" direction="neutral" /></dd></div><div><dt className="mb-1 text-xs text-muted-foreground">کارپوشه (ریال)</dt><dd><MoneyDisplay amount={item.portal?.gross_amount} currency="" direction="neutral" /></dd></div></dl>
      {item.differences.length > 0 && <p className="text-xs text-destructive">{item.differences.join("، ")}</p>}{item.limitations.length > 0 && <p className="text-xs text-muted-foreground">{item.limitations[0]}</p>}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-2"><span className="text-xs text-muted-foreground">{toJalaliDate((item.internal || item.portal)!.issue_date)}</span><Button variant="ghost" onClick={() => onInspect(item)} aria-label={`جزئیات فاکتور ${item.internal?.invoice_no || item.portal?.tax_id || ""}`}>مشاهده جزئیات</Button></div>
    </article>)}</div>
    <div className="hidden min-w-0 md:block">
      <Table className="min-w-[760px]" containerClassName="border-0"><TableCaption className="sr-only">مقایسه فاکتورهای فایل حسابداری و کارپوشه؛ مبالغ به ریال</TableCaption>
        <TableHeader className="bg-muted text-muted-foreground"><TableRow>{["فاکتور / طرف معامله", "تاریخ", "حسابداری (ریال)", "کارپوشه (ریال)", "نتیجه", "جزئیات"].map((h) => <TableHead scope="col" className="px-4 py-3 text-start font-medium" key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{report.items.map((item) => <TableRow key={`${item.internal?.row_id ?? ""}:${item.portal?.row_id ?? ""}`} className="border-t border-border transition-colors hover:bg-muted/40 motion-reduce:transition-none">
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
    <div className="flex flex-wrap items-center justify-between gap-3"><StatusMessage  >{toPersianDigits(report.total)} نتیجه</StatusMessage><div className="flex gap-2"><Button variant="outline" disabled={report.offset === 0} onClick={() => onPage(Math.max(0, report.offset - report.limit))}>قبلی</Button><Button variant="outline" disabled={report.offset + report.limit >= report.total} onClick={() => onPage(report.offset + report.limit)}>بعدی</Button></div></div>
  </section>;
}

export function MoadianComparisonDetails({ item, batches, onClose }: { item: ComparisonItem | null; batches: ImportBatch[]; onClose: () => void }) {
  return <Drawer open={!!item} onOpenChange={(open) => { if (!open) onClose(); }} title="جزئیات تطبیق">
    {item && <><ComparisonStatusLabel item={item} />{item.reason && <p className="text-sm">{item.reason}</p>}{item.limitations.map((text) => <p key={text} className="text-sm text-muted-foreground">{text}</p>)}
      {[{ title: "فایل حسابداری", invoice: item.internal }, { title: "فایل کارپوشه", invoice: item.portal }].map(({ title, invoice }) => <section key={title} className="space-y-3 border-t border-border pt-4"><h3 className="font-medium">{title}</h3>{invoice ? <DrawerDetails>
        <div><dt>فایل</dt><dd>{batches.find((b) => b.id === invoice.batch_id)?.original_name}</dd></div>
        <div><dt>شیت / ردیف</dt><dd>{invoice.sheet} / {toPersianDigits(invoice.row_number)}</dd></div>
        <div><dt>شماره مالیاتی</dt><dd dir="ltr" className="break-all font-mono">{invoice.tax_id || "—"}</dd></div>
        <div><dt>شماره فاکتور</dt><dd dir="ltr">{invoice.invoice_no || "—"}</dd></div>
        <div><dt>طرف معامله</dt><dd>{invoice.party_name || "—"}</dd></div>
        <div><dt>شناسه طرف معامله</dt><dd dir="ltr">{invoice.party_id || "—"}</dd></div>
        <div><dt>تاریخ</dt><dd>{toJalaliDate(invoice.issue_date)}</dd></div>
        <div><dt>مبلغ کل</dt><dd><MoneyDisplay amount={invoice.gross_amount} currency="ریال" direction="neutral" /></dd></div>
        <div><dt>مالیات</dt><dd><MoneyDisplay amount={invoice.tax_amount} currency="ریال" direction="neutral" /></dd></div>
        <div><dt>موضوع / وضعیت</dt><dd>{invoice.subject || "—"} / {invoice.status || "—"}</dd></div>
        {invoice.reference_tax_id && <div><dt>شماره مالیاتی مرجع</dt><dd dir="ltr" className="break-all">{invoice.reference_tax_id}</dd></div>}
      </DrawerDetails> : <EmptyState variant="inline">فاکتور متناظر در این فایل پیدا نشد.</EmptyState>}</section>)}
    </>}
  </Drawer>;
}
