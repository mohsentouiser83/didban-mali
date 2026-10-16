"use client";
import { Form, FormMessage } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/financial/status-badge";
import { EmptyState, ErrorState, LoadingState, MoneyDisplay, toPersianDigits } from "@/components/ui/financial";

import { Table, TableHeader, TableRow, TableHead, TableBody, TableRowHeader, TableCell } from "@/components/ui/table";
import { useReceiptHistory } from "./use-receipt-history";
import { toman } from "@/lib/cashflow-amounts";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Receipt } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";

export function ReceiptHistoryEditor({ companyId, canWrite, onChanged }: { companyId: string; canWrite: boolean; onChanged: () => void }) {
  const controller = useReceiptHistory(companyId, onChanged, canWrite);
  return <ReceiptHistoryView controller={controller} canWrite={canWrite} />;
}
function ReceiptHistoryView({ controller, canWrite }: { controller: ReturnType<typeof useReceiptHistory>; canWrite: boolean }) {
  const { open, setOpen, selected, setSelected, draft, setDraft, confirmed, setConfirmed, search, setSearch, busy, error, today, load, choose, total, valid, save, filtered } = controller;
  return <>
    <Button variant="outline" onClick={() => { setOpen(true); setSelected(null); void load(); }}><Receipt size={18} aria-hidden="true" />مشاهده و ثبت وصول‌ها</Button>
    <Drawer open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }} title={selected ? `وصول‌های فاکتور ${selected.invoice_no}` : "تاریخچه وصول فاکتورها"}>
      <div className="grid gap-4">
        {error && <ErrorState onRetry={() => { setSelected(null); void load(); }} retrying={busy} retryLabel="دریافت دوباره" variant="compact" >{error}</ErrorState>}
        {busy && <LoadingState variant="inline">در حال دریافت یا ذخیره اطلاعات…</LoadingState>}
        {!selected ? <>
          <Input aria-label="جستجوی فاکتور یا مشتری" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جستجوی فاکتور یا مشتری" />
          {!busy && !filtered.length && <EmptyState variant="inline">فاکتوری پیدا نشد.</EmptyState>}
          <div className="min-w-0"><Table className="min-w-[380px]" containerClassName="border-0"><TableHeader className="text-muted-foreground"><TableRow><TableHead scope="col">فاکتور / مشتری</TableHead><TableHead scope="col">وصول ثبت‌شده</TableHead><TableHead scope="col">تاریخچه</TableHead></TableRow></TableHeader><TableBody>{filtered.map((history) => <TableRow key={history.invoice_id}><TableRowHeader scope="row"><Button variant="ghost" className="h-auto min-h-11 w-full flex-col items-start gap-1 whitespace-normal px-0 text-start font-normal" aria-label={`${history.invoice_no} ${history.customer_name}`} onClick={() => choose(history)}><bdi>{history.invoice_no}</bdi><span className="text-xs text-muted-foreground">{history.customer_name}</span></Button></TableRowHeader><TableCell>{history.paid_amount_irr === null ? "نامشخص" : <MoneyDisplay amount={toman(history.paid_amount_irr)} currency="تومان" size="sm" direction="neutral" />}</TableCell><TableCell><StatusBadge status={history.complete ? "completed" : "completed_limited"} label={history.complete ? "کامل" : "ناقص"} /></TableCell></TableRow>)}</TableBody></Table></div>
        </> : <>
          <Button variant="ghost" disabled={busy} onClick={() => setSelected(null)}>بازگشت به فاکتورها</Button>
          <div className="text-sm leading-relaxed text-muted-foreground"><p>{selected.customer_name} · مبلغ فاکتور: <MoneyDisplay amount={toman(selected.gross_amount_irr)} currency="تومان" size="sm" direction="neutral" /></p><p>مجموع وصول قبلی: {selected.paid_amount_irr === null ? "نامشخص" : <MoneyDisplay amount={toman(selected.paid_amount_irr)} currency="تومان" size="sm" direction="neutral" />}</p></div>
          <Form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            {draft.map((row, index) => <div key={index} className="grid gap-3 border-b border-border pb-4 sm:grid-cols-2">
              <div className="grid min-w-0 gap-2 [&_label]:text-sm"><label htmlFor={`receipt-date-${index}`}>تاریخ وصول {new Intl.NumberFormat("fa-IR").format(index + 1)}</label><PersianDatePicker id={`receipt-date-${index}`} value={row.received_on} min={selected.issue_date} max={today} required disabled={!canWrite || busy} onValueChange={(received_on) => setDraft((rows) => rows.map((item, i) => i === index ? { ...item, received_on } : item))} /></div>
              <div className="grid min-w-0 gap-2 [&_label]:text-sm"><label htmlFor={`receipt-amount-${index}`}>مبلغ به تومان</label><Input id={`receipt-amount-${index}`} value={toPersianDigits(row.amount).replace(/\./g, "٫")} inputMode="decimal" required disabled={!canWrite || busy} onChange={(event) => setDraft((rows) => rows.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} /></div>
              <div className="grid min-w-0 gap-2 [&_label]:text-sm"><label htmlFor={`receipt-reference-${index}`}>شماره پیگیری (اختیاری)</label><Input id={`receipt-reference-${index}`} value={row.reference} maxLength={200} disabled={!canWrite || busy} onChange={(event) => setDraft((rows) => rows.map((item, i) => i === index ? { ...item, reference: event.target.value } : item))} /></div>
              {canWrite && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft((rows) => rows.filter((_, i) => i !== index)); setConfirmed(false); }}>حذف این وصول</Button>}
            </div>)}
            {!draft.length && <EmptyState variant="inline">وصول تاریخ‌داری ثبت نشده است.</EmptyState>}
            <div>جمع وصول‌ها: <MoneyDisplay amount={toman(total.toString())} currency="تومان" size="sm" direction="neutral" /></div>
            {canWrite && <>
              <Button type="button" variant="outline" disabled={busy} onClick={() => { setDraft((rows) => [...rows, { received_on: "", amount: "", reference: "" }]); setConfirmed(false); }}>افزودن وصول</Button>
              <label className="text-sm leading-relaxed text-muted-foreground"><Checkbox checked={confirmed} disabled={busy} onCheckedChange={(value) => setConfirmed(value === true)} aria-label="تأیید تاریخچه کامل" /> جایگزینی تاریخچه با فهرست کامل وصول‌ها</label>
              {!valid && <FormMessage>تاریخ یا مبلغ وصول نامعتبر است.</FormMessage>}
              <Button type="submit" disabled={busy || !confirmed || !valid}>ذخیره تاریخچه کامل</Button>
            </>}
          </Form>
        </>}
      </div>
    </Drawer>
  </>;
}
