"use client";
import { DetailGroup, ControlLabel, DetailField, fieldIcon } from "@/components/ui/field-layout";
import { Form, FormMessage } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/financial/status-badge";
import { EmptyState, ErrorState, LoadingState, MoneyDisplay, toPersianDigits } from "@/components/ui/financial";

import { Table, TableHeader, TableRow, TableHead, TableBody, TableRowHeader, TableCell } from "@/components/ui/table";
import { ActionTooltip } from "@/components/ui/tooltip";
import { Calendar, Receipt, User, Wallet } from "@/components/ui/icons";
import { api } from "@/lib/product-api";
import { useReceiptHistory } from "./use-receipt-history";
import { toman } from "@/lib/cashflow-amounts";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";

export function ReceiptHistoryEditor({ companyId, canWrite, onChanged, request = api }: { companyId: string; canWrite: boolean; onChanged: () => void; request?: typeof api }) {
  const controller = useReceiptHistory(companyId, onChanged, canWrite, request);
  return <ReceiptHistoryView controller={controller} canWrite={canWrite} />;
}
function ReceiptHistoryView({ controller, canWrite }: { controller: ReturnType<typeof useReceiptHistory>; canWrite: boolean }) {
  const { open, setOpen, selected, setSelected, draft, setDraft, confirmed, setConfirmed, search, setSearch, busy, error, today, load, choose, total, valid, save, filtered } = controller;
  return <>
    <Button variant="outline" onClick={() => { setOpen(true); setSelected(null); void load(); }}><Receipt size={18} aria-hidden="true" />مشاهده و ثبت وصول‌ها</Button>
    <Drawer size="wide" open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }} title={selected ? `وصول‌های فاکتور ${selected.invoice_no}` : "تاریخچه وصول فاکتورها"}>
      <div className="grid gap-4">
        {error && <ErrorState onRetry={() => { setSelected(null); void load(); }} retrying={busy} retryLabel="دریافت دوباره" variant="compact" >{error}</ErrorState>}
        {busy && <LoadingState variant="inline">در حال دریافت یا ذخیره اطلاعات…</LoadingState>}
        {!selected ? <>
          <ControlLabel htmlFor="receipt-history-search" icon={fieldIcon("جستجوی فاکتور")}>جستجوی فاکتور یا مشتری</ControlLabel><Input id="receipt-history-search" aria-label="جستجوی فاکتور یا مشتری" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جستجوی فاکتور یا مشتری" />
          {!busy && !filtered.length && <EmptyState variant="inline">فاکتوری پیدا نشد.</EmptyState>}
          <div className="min-w-0"><Table className="min-w-[380px]" containerClassName="border-0"><TableHeader className="text-muted-foreground"><TableRow><TableHead scope="col"><span className="flex items-center gap-2"><User size={17} aria-hidden="true" />فاکتور / مشتری</span></TableHead><TableHead scope="col"><span className="flex items-center gap-2"><Wallet size={17} aria-hidden="true" />وصول ثبت‌شده</span></TableHead><TableHead scope="col"><span className="flex items-center gap-2"><Calendar size={17} aria-hidden="true" />تاریخچه</span></TableHead></TableRow></TableHeader><TableBody>{filtered.map((history) => <TableRow key={history.invoice_id} onActivate={() => choose(history)}><TableRowHeader scope="row"><ActionTooltip content={`${history.invoice_no} ${history.customer_name}`}><Button variant="ghost" className="h-auto min-h-11 w-full flex-col items-start gap-1 overflow-hidden px-0 text-start font-normal" aria-label={`${history.invoice_no} ${history.customer_name}`} onClick={() => choose(history)}><bdi className="block max-w-64 truncate">{history.invoice_no}</bdi><span className="block max-w-64 truncate text-xs text-muted-foreground">{history.customer_name}</span></Button></ActionTooltip></TableRowHeader><TableCell>{history.paid_amount_irr === null ? "نامشخص" : <MoneyDisplay amount={toman(history.paid_amount_irr)} currency="تومان" size="sm" direction="neutral" />}</TableCell><TableCell><StatusBadge status={history.complete ? "completed" : "completed_limited"} label={history.complete ? "کامل" : "ناقص"} /></TableCell></TableRow>)}</TableBody></Table></div>
        </> : <>
          <Button variant="ghost" disabled={busy} onClick={() => setSelected(null)}>بازگشت به فاکتورها</Button>
          <DetailGroup><DetailField icon={fieldIcon("مشتری")} label="مشتری">{selected.customer_name}</DetailField><DetailField icon={fieldIcon("مبلغ فاکتور")} label="مبلغ فاکتور"><MoneyDisplay amount={toman(selected.gross_amount_irr)} currency="تومان" size="sm" direction="neutral" /></DetailField><DetailField icon={fieldIcon("مجموع وصول قبلی")} label="مجموع وصول قبلی">{selected.paid_amount_irr === null ? "نامشخص" : <MoneyDisplay amount={toman(selected.paid_amount_irr)} currency="تومان" size="sm" direction="neutral" />}</DetailField></DetailGroup>
          <Form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            {draft.map((row, index) => <div key={index} className="grid gap-3 border-b border-border pb-4 sm:grid-cols-2">
              <div className="grid min-w-0 gap-2 [&_label]:text-sm"><ControlLabel htmlFor={`receipt-date-${index}`} icon={fieldIcon("تاریخ وصول")}>تاریخ وصول {new Intl.NumberFormat("fa-IR").format(index + 1)}</ControlLabel><PersianDatePicker id={`receipt-date-${index}`} value={row.received_on} min={selected.issue_date} max={today} required disabled={!canWrite || busy} onValueChange={(received_on) => setDraft((rows) => rows.map((item, i) => i === index ? { ...item, received_on } : item))} /></div>
              <div className="grid min-w-0 gap-2 [&_label]:text-sm"><ControlLabel htmlFor={`receipt-amount-${index}`} icon={fieldIcon("مبلغ به تومان")}>مبلغ به تومان</ControlLabel><Input id={`receipt-amount-${index}`} value={toPersianDigits(row.amount).replace(/\./g, "٫")} inputMode="decimal" required disabled={!canWrite || busy} onChange={(event) => setDraft((rows) => rows.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} /></div>
              <div className="grid min-w-0 gap-2 [&_label]:text-sm"><ControlLabel htmlFor={`receipt-reference-${index}`} icon={fieldIcon("شماره پیگیری (اختیاری)")}>شماره پیگیری (اختیاری)</ControlLabel><Input id={`receipt-reference-${index}`} dir="ltr" value={row.reference} maxLength={200} disabled={!canWrite || busy} onChange={(event) => setDraft((rows) => rows.map((item, i) => i === index ? { ...item, reference: event.target.value } : item))} /></div>
              {canWrite && <Button type="button" variant="ghost" className="h-11 self-end" disabled={busy} onClick={() => { setDraft((rows) => rows.filter((_, i) => i !== index)); setConfirmed(false); }}>حذف این وصول</Button>}
            </div>)}
            {!draft.length && <EmptyState variant="inline">وصول تاریخ‌داری ثبت نشده است.</EmptyState>}
            <DetailGroup><DetailField icon={fieldIcon("جمع وصول‌ها")} label="جمع وصول‌ها"><MoneyDisplay amount={toman(total.toString())} currency="تومان" size="sm" direction="neutral" /></DetailField></DetailGroup>
            {canWrite && <>
              <Button type="button" variant="outline" disabled={busy} onClick={() => { setDraft((rows) => [...rows, { received_on: "", amount: "", reference: "" }]); setConfirmed(false); }}>افزودن وصول</Button>
              <ControlLabel className="text-sm leading-relaxed text-muted-foreground" icon={fieldIcon("جایگزینی تاریخچه با فهرست کامل وصول‌ها")}><Checkbox checked={confirmed} disabled={busy} onCheckedChange={(value) => setConfirmed(value === true)} aria-label="تأیید تاریخچه کامل" /> جایگزینی تاریخچه با فهرست کامل وصول‌ها</ControlLabel>
              {!valid && <FormMessage>تاریخ یا مبلغ وصول نامعتبر است.</FormMessage>}
              <Button type="submit" disabled={busy || !confirmed || !valid}>ذخیره تاریخچه کامل</Button>
            </>}
          </Form>
        </>}
      </div>
    </Drawer>
  </>;
}
