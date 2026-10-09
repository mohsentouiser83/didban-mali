"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toman } from "@/lib/cashflow-amounts";
import { api } from "@/lib/product-api";
import type { Company, PlannedCashPayment } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { MoneyDisplay, toJalaliDate } from "@/components/ui/financial";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerFooter } from "@/components/ui/drawer";
import { Plus, Trash2 } from "@/components/ui/icons";
import styles from "./cash-payment-plan.module.css";
const categories = { payroll: "حقوق و بیمه", vendor: "تامین‌کنندگان", rent: "اجاره", tax: "مالیات", other: "سایر پرداخت‌ها" };
export function CashPaymentPlan({ company, asOfDate, onChanged }: { company: Company; asOfDate: string; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const endDate = new Date(`${asOfDate}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 29);
  const lastDate = endDate.toISOString().slice(0, 10);

  const [items, setItems] = useState<PlannedCashPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<PlannedCashPayment["category"]>("vendor");
  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PlannedCashPayment | null>(null);
  const writable = !!company.role && ["owner", "finance_manager", "advisor"].includes(company.role);
  const upcoming = items.filter((item) => item.payment_date >= asOfDate && item.payment_date <= lastDate);
  const path = `/companies/${company.id}/cashflow/payments`;
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api<PlannedCashPayment[]>(path)); setError(""); }
    catch { setError("برنامه پرداخت دریافت نشد. دوباره تلاش کنید."); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => { let active = true; setLoading(true); setItems([]);
    api<PlannedCashPayment[]>(path).then((rows) => { if (active) { setItems(rows); setError(""); } }).catch(() => { if (active) setError("برنامه پرداخت دریافت نشد. دوباره تلاش کنید."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = amount.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[,٬\s]/g, "");
    if (!/^[0-9]{1,23}$/.test(digits) || BigInt(digits) <= BigInt(0) || !paymentDate || !title.trim()) { setFormError("عنوان، تاریخ معتبر و مبلغ مثبت به تومان وارد کنید."); return; }
    if (paymentDate < asOfDate) { setFormError("تاریخ پرداخت باید امروز یا پس از آن باشد."); return; }
    setSaving(true); setFormError("");
    try { await api(path, { method: "POST", body: JSON.stringify({ title: title.trim(), category, payment_date: paymentDate, amount_irr: (BigInt(digits) * BigInt(10)).toString() }) });
      setNotice(paymentDate > lastDate ? "پرداخت ثبت شد؛ چون موعد آن بعد از ۳۰ روز آینده است، فعلاً در این جدول و کارت‌ها نمایش داده نمی‌شود." : "");
      setTitle(""); setAmount(""); setPaymentDate(""); setAdding(false); await load(); onChanged();
    } catch { setFormError("پرداخت ثبت نشد؛ اطلاعات را بررسی و دوباره تلاش کنید."); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!pendingDelete) return;
    setSaving(true);
    try { await api(`${path}/${pendingDelete.id}`, { method: "DELETE" }); setPendingDelete(null); await load(); onChanged(); }
    catch { setError("حذف پرداخت انجام نشد. دوباره تلاش کنید."); }
    finally { setSaving(false); }
  }
  return <section className={styles.section} aria-labelledby="payment-plan-title">
    <div className={styles.heading}>
      <div><h2 id="payment-plan-title">پرداخت‌های پیش رو</h2><span>۳۰ روز آینده</span></div>
      {writable && <Button variant="outline" onClick={() => { setFormError(""); setNotice(""); setAdding(true); }}><Plus size={16} weight="regular" aria-hidden="true" />افزودن پرداخت</Button>}
    </div>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {error && <div role="alert" className={styles.error}><p>{error}</p><Button variant="outline" onClick={() => void load()} disabled={loading}>تلاش دوباره</Button></div>}
    {loading ? <p role="status" className={styles.empty}>در حال دریافت پرداخت‌ها…</p> : !error && <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead><tr><th scope="col">عنوان پرداخت</th><th scope="col">مبلغ</th><th scope="col">موعد پرداخت</th>{writable && <th scope="col"><span className="sr-only">عملیات</span></th>}</tr></thead>
        <tbody>{upcoming.length ? upcoming.map((item) => <tr key={item.id}>
          <th scope="row">{item.title}<small>{categories[item.category]}</small></th>
          <td><MoneyDisplay amount={toman(item.amount_irr)} currency="تومان" direction="neutral" size="sm" /></td>
          <td>{toJalaliDate(item.payment_date)}</td>
          {writable && <td><Button variant="ghost" size="icon" onClick={() => setPendingDelete(item)} disabled={saving} aria-label={`حذف ${item.title}`}><Trash2 size={16} aria-hidden="true" /></Button></td>}
        </tr>) : <tr><td className={styles.empty} colSpan={writable ? 4 : 3}>پرداختی برای ۳۰ روز آینده ثبت نشده است.</td></tr>}</tbody>
      </table>
    </div>}
    <Drawer open={adding} onOpenChange={(open) => { if (!saving) setAdding(open); }} title="افزودن پرداخت" description="مبلغ و موعد پرداخت را وارد کنید. هر تاریخ آینده قابل ثبت است.">
        <form onSubmit={(event) => void save(event)} className={styles.drawerForm}>
          <div><label htmlFor="cash-payment-title">عنوان پرداخت</label><Input id="cash-payment-title" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} disabled={saving} placeholder="مثلاً حقوق مهر" /></div>
          <div><label htmlFor="cash-payment-category">نوع پرداخت</label><Select dir="rtl" value={category} onValueChange={(value) => setCategory(value as PlannedCashPayment["category"])} disabled={saving}><SelectTrigger id="cash-payment-category"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(categories).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div><label htmlFor="cash-payment-date">موعد پرداخت</label><PersianDatePicker id="cash-payment-date" value={paymentDate} onValueChange={setPaymentDate} min={asOfDate} required disabled={saving} /></div>
          <div><label htmlFor="cash-payment-amount">مبلغ به تومان</label><Input id="cash-payment-amount" dir="ltr" inputMode="numeric" required value={amount} onChange={(event) => setAmount(event.target.value)} disabled={saving} /></div>
          {formError && <p role="alert" className={styles.formError}>{formError}</p>}
          <DrawerFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setAdding(false)}>انصراف</Button><Button type="submit" disabled={saving}>{saving ? "در حال ثبت…" : "ثبت پرداخت"}</Button></DrawerFooter>
        </form>
    </Drawer>
    <Dialog open={!!pendingDelete} onOpenChange={(open) => { if (!open && !saving) setPendingDelete(null); }}>
      <DialogContent dir="rtl"><DialogHeader><DialogTitle>حذف از برنامه پرداخت؟</DialogTitle><DialogDescription>«{pendingDelete?.title}» از برنامه و پیش‌بینی حذف می‌شود.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setPendingDelete(null)}>انصراف</Button><Button disabled={saving} onClick={() => void remove()}>حذف پرداخت</Button></DialogFooter></DialogContent>
    </Dialog>
  </section>;
}
