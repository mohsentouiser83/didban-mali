"use client";
import { useState } from "react";
import { api } from "@/lib/product-api";
import type { InvoiceHistory } from "@/lib/financial-periods";
import { rial, toman } from "@/lib/cashflow-amounts";
import { MoneyDisplay, toJalaliDate, toPersianDigits } from "@/components/ui/financial";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import styles from "./financial-period-selector.module.css";

type DraftReceipt = { received_on: string; amount: string; reference: string };
const digits = (text: string) => text.replace(/[۰-۹٠-٩]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".includes(digit) ? "۰۱۲۳۴۵۶۷۸۹".indexOf(digit) : "٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[,٬\s]/g, "").replace(/٫/g, ".");
const receiptRial = (text: string): bigint | null => {
  const match = /^(\d+)(?:\.(\d))?$/.exec(digits(text));
  return match ? BigInt(match[1]) * BigInt(10) + BigInt(match[2] ?? "0") : null;
};

export function ReceiptHistoryEditor({ companyId, canWrite, onChanged }: { companyId: string; canWrite: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [histories, setHistories] = useState<InvoiceHistory[]>([]);
  const [selected, setSelected] = useState<InvoiceHistory | null>(null);
  const [draft, setDraft] = useState<DraftReceipt[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  async function load() {
    setBusy(true); setError("");
    try { setHistories(await api<InvoiceHistory[]>(`/companies/${companyId}/receivables/receipt-history`)); }
    catch (err) { setError(err instanceof Error ? err.message : "تاریخچه دریافت نشد."); }
    finally { setBusy(false); }
  }
  function choose(history: InvoiceHistory) {
    setSelected(history); setConfirmed(false); setError("");
    setDraft(history.receipts.map((receipt) => ({ received_on: receipt.received_on, amount: toman(receipt.amount_irr), reference: receipt.reference ?? "" })));
  }
  const total = draft.reduce((sum, row) => sum + (receiptRial(row.amount) ?? BigInt(0)), BigInt(0));
  const valid = !!selected && total <= rial(selected.gross_amount_irr) && draft.every((row) => row.received_on >= selected.issue_date && row.received_on <= today && (receiptRial(row.amount) ?? BigInt(0)) > BigInt(0));
  async function save() {
    if (!selected || !confirmed || !valid || busy) return;
    setBusy(true); setError("");
    try {
      await api(`/companies/${companyId}/receivables/invoices/${selected.invoice_id}/receipt-history`, { method: "PUT", body: JSON.stringify({
        confirm_complete: true, expected_version: selected.version,
        receipts: draft.map((row) => ({ received_on: row.received_on, amount_irr: receiptRial(row.amount)!.toString(), reference: row.reference.trim() || null })),
      }) });
      setSelected(null); onChanged(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "ذخیره تاریخچه انجام نشد."); }
    finally { setBusy(false); }
  }
  const filtered = histories.filter((history) => `${history.customer_name} ${history.invoice_no}`.includes(search));
  return <section className={styles.panel} aria-label="تاریخچه وصول فاکتورها">
    <div><h2>تاریخچه وصول‌ها</h2><p className={styles.caption}>برای گزارش دقیق گذشته، هر وصول باید تاریخ و مبلغ داشته باشد؛ فاکتورهای تسویه‌شده هم قابل بررسی هستند.</p></div>
    <Button variant="outline" onClick={() => { setOpen(true); setSelected(null); void load(); }}>مشاهده و ثبت وصول‌ها</Button>
    <Drawer open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }} title={selected ? `وصول‌های فاکتور ${selected.invoice_no}` : "تاریخچه وصول فاکتورها"} description="مبالغ را به تومان وارد کنید؛ تاریخ وصول، تاریخ واقعی دریافت وجه است.">
      <div className={styles.history}>
        {error && <div role="alert" className={styles.error}>{error}<Button variant="ghost" onClick={() => { setSelected(null); void load(); }} disabled={busy}>دریافت دوباره</Button></div>}
        {busy && <p role="status">در حال دریافت یا ذخیره اطلاعات…</p>}
        {!selected ? <>
          <Input aria-label="جستجوی فاکتور یا مشتری" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جستجوی فاکتور یا مشتری" />
          {!busy && !filtered.length && <p className={styles.caption}>فاکتوری پیدا نشد.</p>}
          {filtered.map((history) => <div key={history.invoice_id} className={styles.panel}>
            <strong>{history.customer_name} · فاکتور {history.invoice_no}</strong><p className={styles.caption}>{toJalaliDate(history.issue_date)} · {history.complete ? "تاریخچه کامل" : "نیازمند تکمیل تاریخ وصول‌ها"}</p>
            <div>وصول ثبت‌شده: <MoneyDisplay amount={toman(history.paid_amount_irr)} currency="تومان" size="sm" direction="neutral" /></div>
            <Button variant="outline" onClick={() => choose(history)}>جزئیات وصول</Button>
          </div>)}
        </> : <>
          <Button variant="ghost" disabled={busy} onClick={() => setSelected(null)}>بازگشت به فاکتورها</Button>
          <div className={styles.caption}><p>{selected.customer_name} · مبلغ فاکتور: <MoneyDisplay amount={toman(selected.gross_amount_irr)} currency="تومان" size="sm" direction="neutral" /></p><p>مجموع وصول قبلی: <MoneyDisplay amount={toman(selected.paid_amount_irr)} currency="تومان" size="sm" direction="neutral" /></p></div>
          <form className={styles.history} onSubmit={(event) => { event.preventDefault(); void save(); }}>
            {draft.map((row, index) => <div key={index} className={styles.receipt}>
              <div className={styles.field}><label htmlFor={`receipt-date-${index}`}>تاریخ وصول {new Intl.NumberFormat("fa-IR").format(index + 1)}</label><PersianDatePicker id={`receipt-date-${index}`} value={row.received_on} min={selected.issue_date} max={today} required disabled={!canWrite || busy} onValueChange={(received_on) => setDraft((rows) => rows.map((item, i) => i === index ? { ...item, received_on } : item))} /></div>
              <div className={styles.field}><label htmlFor={`receipt-amount-${index}`}>مبلغ به تومان</label><Input id={`receipt-amount-${index}`} value={toPersianDigits(row.amount).replace(/\./g, "٫")} inputMode="decimal" required disabled={!canWrite || busy} onChange={(event) => setDraft((rows) => rows.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} /></div>
              <div className={styles.field}><label htmlFor={`receipt-reference-${index}`}>شماره پیگیری (اختیاری)</label><Input id={`receipt-reference-${index}`} value={row.reference} maxLength={200} disabled={!canWrite || busy} onChange={(event) => setDraft((rows) => rows.map((item, i) => i === index ? { ...item, reference: event.target.value } : item))} /></div>
              {canWrite && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft((rows) => rows.filter((_, i) => i !== index)); setConfirmed(false); }}>حذف این وصول</Button>}
            </div>)}
            {!draft.length && <p className={styles.caption}>وصول تاریخ‌داری ثبت نشده است.</p>}
            <div>جمع وصول‌ها: <MoneyDisplay amount={toman(total.toString())} currency="تومان" size="sm" direction="neutral" /></div>
            {canWrite && <>
              <Button type="button" variant="outline" disabled={busy} onClick={() => { setDraft((rows) => [...rows, { received_on: "", amount: "", reference: "" }]); setConfirmed(false); }}>افزودن وصول</Button>
              <label className={styles.caption}><Checkbox checked={confirmed} disabled={busy} onCheckedChange={(value) => setConfirmed(value === true)} aria-label="تأیید تاریخچه کامل" /> تمام وصول‌های این فاکتور را وارد کرده‌ام؛ این فهرست جایگزین تاریخچه و مجموع وصول قبلی شود.</label>
              {!valid && <p role="alert" className={styles.error}>تاریخ و مبلغ وصول‌ها را بررسی کنید؛ جمع وصول نباید از مبلغ فاکتور بیشتر باشد.</p>}
              <Button type="submit" disabled={busy || !confirmed || !valid}>ذخیره تاریخچه کامل</Button>
            </>}
          </form>
        </>}
      </div>
    </Drawer>
  </section>;
}
