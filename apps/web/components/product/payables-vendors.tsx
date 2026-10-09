"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/product-api";
import { rial, toman } from "@/lib/cashflow-amounts";
import type { VendorsPayablesResponse } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { PayableEntries } from "./payable-entries";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyDisplay, toPersianDigits } from "@/components/ui/financial";
import { Search, ChevronLeft } from "@/components/ui/icons";
import styles from "./receivables-customers.module.css";

const normalize = (text: string) => text.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, " ").trim().toLocaleLowerCase();
export function PayablesVendors({ companyId, asOfDate }: { companyId: string; asOfDate: string }) {
  const [data, setData] = useState<VendorsPayablesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setFailed(false); setData(null); setSelectedId(null);
    const base = `/companies/${companyId}/payables`;
    void api<VendorsPayablesResponse>(`${base}/vendors?as_of_date=${asOfDate}`)
      .then((vendors) => { if (active) setData(vendors); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, asOfDate, retry]);
  const customers = (data?.items ?? []).filter((customer) => rial(customer.total_payable_irr) > BigInt(0))
    .filter((customer) => normalize(customer.name).includes(normalize(search)) && (!overdueOnly || rial(customer.overdue_amount_irr) > BigInt(0)))
    .sort((a, b) => {
      const difference = rial(b.overdue_amount_irr) - rial(a.overdue_amount_irr);
      return difference > BigInt(0) ? 1 : difference < BigInt(0) ? -1 : a.name.localeCompare(b.name, "fa");
    });
  const selected = data?.items.find((customer) => customer.counterparty_id === selectedId);
  return <section className={styles.section} aria-labelledby="payables-vendors-title" aria-busy={loading}>
    <div className={styles.heading}><div><h2 id="payables-vendors-title">تأمین‌کنندگان طلبکار</h2><p>به ترتیب بیشترین مبلغ سررسیدگذشته</p></div>
      <div className={styles.controls}><div className={styles.search}><Search size={17} aria-hidden="true" /><Input aria-label="جستجوی تأمین‌کننده" placeholder="جستجوی تأمین‌کننده" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className={styles.filters} role="group" aria-label="فیلتر تأمین‌کنندگان"><Button variant={overdueOnly ? "ghost" : "secondary"} aria-pressed={!overdueOnly} onClick={() => setOverdueOnly(false)}>همه</Button><Button variant={overdueOnly ? "secondary" : "ghost"} aria-pressed={overdueOnly} onClick={() => setOverdueOnly(true)}>سررسیدگذشته</Button></div>
      </div>
    </div>
    {failed ? <div className={styles.empty} role="alert"><p>فهرست تأمین‌کنندگان دریافت نشد.</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>تلاش دوباره</Button></div> : <div className={styles.scroll}><table className={styles.table}>
      <thead><tr><th scope="col">تأمین‌کننده</th><th scope="col">مانده بدهی</th><th scope="col">مبلغ سررسیدگذشته</th><th scope="col">میانگین تأخیر (برآوردی)</th></tr></thead>
      <tbody>{loading ? [0, 1, 2].map((row) => <tr key={row}>{[0, 1, 2, 3].map((cell) => <td key={cell}><Skeleton className="h-5 w-full" /></td>)}</tr>) : customers.length ? customers.map((customer) => <tr key={customer.counterparty_id}>
        <th scope="row"><Button variant="ghost" className={styles.customer} onClick={() => setSelectedId(customer.counterparty_id)}>{customer.name}<ChevronLeft size={16} aria-hidden="true" /></Button></th>
        <td><MoneyDisplay amount={toman(customer.total_payable_irr)} currency="تومان" direction="neutral" size="sm" /></td>
        <td><MoneyDisplay amount={toman(customer.overdue_amount_irr)} currency="تومان" direction="neutral" size="sm" /></td>
        <td>{customer.avg_delay_days > 0 ? `${toPersianDigits(customer.avg_delay_days)} روز` : "—"}</td>
      </tr>) : <tr><td colSpan={4} className={styles.empty}>{search || overdueOnly ? "تأمین‌کننده‌ای با این جستجو و فیلتر پیدا نشد." : "بدهی بازی به تأمین‌کنندگان ثبت نشده است."}</td></tr>}</tbody>
    </table></div>}
    <Drawer open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }} title={selected?.name ?? "جزئیات تأمین‌کننده"} description="اسناد بدهی و پرداخت این تأمین‌کننده">
      {selected && <><div className={styles.balance}><span>مانده بدهی</span><MoneyDisplay amount={toman(selected.total_payable_irr)} currency="تومان" direction="neutral" size="lg" /></div>
        <PayableEntries key={selected.counterparty_id} companyId={companyId} counterpartyId={selected.counterparty_id} asOfDate={asOfDate} /></>}

    </Drawer>
  </section>;
}
