"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/product-api";
import { rial, toman } from "@/lib/cashflow-amounts";
import type { CustomersReceivablesResponse, InvoicesReceivablesResponse } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay, toJalaliDate, toPersianDigits } from "@/components/ui/financial";
import { Search, ChevronLeft } from "@/components/ui/icons";
import styles from "./receivables-customers.module.css";

const normalize = (text: string) => text.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, " ").trim().toLocaleLowerCase();
export function ReceivablesCustomers({ companyId, asOfDate }: { companyId: string; asOfDate: string }) {
  const [data, setData] = useState<{ customers: CustomersReceivablesResponse; invoices: InvoicesReceivablesResponse } | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setFailed(false); setData(null); setSelectedId(null);
    const base = `/companies/${companyId}/receivables`;
    void Promise.all([
      api<CustomersReceivablesResponse>(`${base}/customers?as_of_date=${asOfDate}`),
      api<InvoicesReceivablesResponse>(`${base}/invoices?as_of_date=${asOfDate}`),
    ]).then(([customers, invoices]) => { if (active) setData({ customers, invoices }); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, asOfDate, retry]);
  const invoices = data?.invoices.items.filter((invoice) => rial(invoice.remaining_amount_irr) > BigInt(0)) ?? [];
  const maxDelays = new Map<string, number>();
  for (const invoice of invoices) {
    maxDelays.set(invoice.counterparty_id, Math.max(maxDelays.get(invoice.counterparty_id) ?? 0, invoice.delay_days));
  }
  const customers = (data?.customers.items ?? []).filter((customer) => rial(customer.total_outstanding_irr) > BigInt(0))
    .filter((customer) => normalize(customer.name).includes(normalize(search)) && (!overdueOnly || rial(customer.overdue_amount_irr) > BigInt(0)))
    .sort((a, b) => {
      const difference = rial(b.overdue_amount_irr) - rial(a.overdue_amount_irr);
      return difference > BigInt(0) ? 1 : difference < BigInt(0) ? -1 : a.name.localeCompare(b.name, "fa");
    });
  const selected = data?.customers.items.find((customer) => customer.counterparty_id === selectedId);
  const selectedInvoices = invoices.filter((invoice) => invoice.counterparty_id === selectedId)
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  return <section className={styles.section} aria-labelledby="receivables-customers-title" aria-busy={loading}>
    <div className={styles.heading}><div><h2 id="receivables-customers-title">مشتریان بدهکار</h2><p>به ترتیب بیشترین مبلغ سررسیدگذشته</p></div>
      <div className={styles.controls}><div className={styles.search}><Search size={17} aria-hidden="true" /><Input aria-label="جستجوی مشتری" placeholder="جستجوی مشتری" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className={styles.filters} role="group" aria-label="فیلتر مشتریان"><Button variant={overdueOnly ? "ghost" : "secondary"} aria-pressed={!overdueOnly} onClick={() => setOverdueOnly(false)}>همه</Button><Button variant={overdueOnly ? "secondary" : "ghost"} aria-pressed={overdueOnly} onClick={() => setOverdueOnly(true)}>سررسیدگذشته</Button></div>
      </div>
    </div>
    {failed ? <div className={styles.empty} role="alert"><p>فهرست مشتریان دریافت نشد.</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>تلاش دوباره</Button></div> : <div className={styles.scroll}><table className={styles.table}>
      <thead><tr><th scope="col">مشتری</th><th scope="col">مانده مطالبات</th><th scope="col">مبلغ سررسیدگذشته</th><th scope="col">بیشترین تأخیر</th></tr></thead>
      <tbody>{loading ? [0, 1, 2].map((row) => <tr key={row}>{[0, 1, 2, 3].map((cell) => <td key={cell}><Skeleton className="h-5 w-full" /></td>)}</tr>) : customers.length ? customers.map((customer) => <tr key={customer.counterparty_id}>
        <th scope="row"><Button variant="ghost" className={styles.customer} onClick={() => setSelectedId(customer.counterparty_id)}>{customer.name}<ChevronLeft size={16} aria-hidden="true" /></Button></th>
        <td><MoneyDisplay amount={toman(customer.total_outstanding_irr)} currency="تومان" direction="neutral" size="sm" /></td>
        <td><MoneyDisplay amount={toman(customer.overdue_amount_irr)} currency="تومان" direction="neutral" size="sm" /></td>
        <td>{(maxDelays.get(customer.counterparty_id) ?? 0) > 0 ? `${toPersianDigits(maxDelays.get(customer.counterparty_id)!)} روز` : "—"}</td>
      </tr>) : <tr><td colSpan={4} className={styles.empty}>{search || overdueOnly ? "مشتری‌ای با این جستجو و فیلتر پیدا نشد." : "مطالبه بازی از مشتریان ثبت نشده است."}</td></tr>}</tbody>
    </table></div>}
    <Drawer open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }} title={selected?.name ?? "جزئیات مشتری"} description="فاکتورهای تسویه‌نشده این مشتری">
      {selected && <><div className={styles.balance}><span>مانده مطالبات</span><MoneyDisplay amount={toman(selected.total_outstanding_irr)} currency="تومان" direction="neutral" size="lg" /></div>
        <div className={styles.invoices}>{selectedInvoices.length ? selectedInvoices.map((invoice) => <article key={invoice.id} className={styles.invoice}>
          <div className={styles.invoiceHeading}><h3>فاکتور {toPersianDigits(invoice.invoice_no)}</h3><span className={invoice.delay_days > 0 ? styles.overdue : undefined}>{!invoice.due_date ? "سررسید نامشخص" : invoice.delay_days > 0 ? `${toPersianDigits(invoice.delay_days)} روز تأخیر` : "سررسیدنرسیده"}</span></div>
          <dl><div><dt>مانده</dt><dd><MoneyDisplay amount={toman(invoice.remaining_amount_irr)} currency="تومان" direction="neutral" size="sm" /></dd></div><div><dt>سررسید</dt><dd>{invoice.due_date ? toJalaliDate(invoice.due_date) : "ثبت نشده"}</dd></div></dl>
        </article>) : <p className={styles.empty}>فاکتور تسویه‌نشده‌ای پیدا نشد.</p>}</div></>}
    </Drawer>
  </section>;
}
