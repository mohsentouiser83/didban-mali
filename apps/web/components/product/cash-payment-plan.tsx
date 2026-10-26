"use client";
import { ControlLabel, fieldIcon } from "@/components/ui/field-layout";
import { FormMessage } from "@/components/ui/form";
import { StatusMessage, ErrorState, LoadingState, MoneyDisplay, toJalaliDate } from "@/components/ui/financial";

import { TableEmptyCell, Table, TableHeader, TableRow, TableHead, TableBody, TableRowHeader, TableCell } from "@/components/ui/table";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toman } from "@/lib/cashflow-amounts";
import { api } from "@/lib/product-api";
import type { Company, PlannedCashPayment } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer, DrawerFooter, DrawerForm } from "@/components/ui/drawer";
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
      <div><h2 id="payment-plan-title">پرداخت‌های پیش رو</h2></div>
      {writable && <Button variant="outline" onClick={() => { setFormError(""); setNotice(""); setAdding(true); }}><Plus size={16} weight="regular" aria-hidden="true" />افزودن پرداخت</Button>}
    </div>
    {notice && <StatusMessage  >{notice}</StatusMessage>}
    {error && <ErrorState onRetry={() => void load()} retrying={loading} variant="compact" ><p>{error}</p></ErrorState>}
    {loading ? <LoadingState variant="list" rows={3} label="در حال دریافت پرداخت‌ها…" /> : !error && <div className="min-w-0">
      <Table className="min-w-[640px]" containerClassName="border-0">
        <TableHeader><TableRow><TableHead scope="col">عنوان پرداخت</TableHead><TableHead scope="col">مبلغ</TableHead><TableHead scope="col">موعد پرداخت</TableHead>{writable && <TableHead scope="col"><span className="sr-only">عملیات</span></TableHead>}</TableRow></TableHeader>
        <TableBody>{upcoming.length ? upcoming.map((item) => <TableRow key={item.id}>
          <TableRowHeader scope="row">{item.title}<small className="mt-1 block text-xs text-muted-foreground">{categories[item.category]}</small></TableRowHeader>
          <TableCell><MoneyDisplay amount={toman(item.amount_irr)} currency="تومان" direction="neutral" size="sm" /></TableCell>
          <TableCell>{toJalaliDate(item.payment_date)}</TableCell>
          {writable && <TableCell><Button variant="ghost" size="icon" onClick={() => setPendingDelete(item)} disabled={saving} aria-label={`حذف ${item.title}`}><Trash2 size={16} aria-hidden="true" /></Button></TableCell>}
        </TableRow>) : <TableRow><TableEmptyCell className="h-40 p-0 text-center text-muted-foreground" colSpan={writable ? 4 : 3}>پرداختی برای ۳۰ روز آینده ثبت نشده است.</TableEmptyCell></TableRow>}</TableBody>
      </Table>
    </div>}
    <Drawer open={adding} onOpenChange={(open) => { if (!saving) setAdding(open); }} title="افزودن پرداخت" description="مبلغ و موعد پرداخت را وارد کنید. هر تاریخ آینده قابل ثبت است.">
        <DrawerForm onSubmit={(event) => void save(event)}>
          <div><ControlLabel htmlFor="cash-payment-title" icon={fieldIcon("عنوان پرداخت")}>عنوان پرداخت</ControlLabel><Input id="cash-payment-title" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} disabled={saving} placeholder="مثلاً حقوق مهر" /></div>
          <div><ControlLabel htmlFor="cash-payment-category" icon={fieldIcon("نوع پرداخت")}>نوع پرداخت</ControlLabel><Select dir="rtl" value={category} onValueChange={(value) => setCategory(value as PlannedCashPayment["category"])} disabled={saving}><SelectTrigger id="cash-payment-category"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(categories).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div><ControlLabel htmlFor="cash-payment-date" icon={fieldIcon("موعد پرداخت")}>موعد پرداخت</ControlLabel><PersianDatePicker id="cash-payment-date" value={paymentDate} onValueChange={setPaymentDate} min={asOfDate} required disabled={saving} /></div>
          <div><ControlLabel htmlFor="cash-payment-amount" icon={fieldIcon("مبلغ به تومان")}>مبلغ به تومان</ControlLabel><Input id="cash-payment-amount" dir="ltr" inputMode="numeric" required value={amount} onChange={(event) => setAmount(event.target.value)} disabled={saving} /></div>
          {formError && <FormMessage>{formError}</FormMessage>}
          <DrawerFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setAdding(false)}>انصراف</Button><Button type="submit" disabled={saving}>{saving ? "در حال ثبت…" : "ثبت پرداخت"}</Button></DrawerFooter>
        </DrawerForm>
    </Drawer>
    <ConfirmDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open && !saving) setPendingDelete(null); }} title="حذف از برنامه پرداخت؟" description={`«${pendingDelete?.title ?? ""}» از برنامه و پیش‌بینی حذف می‌شود.`} busy={saving} confirmLabel="حذف پرداخت" onConfirm={() => void remove()} />
  </section>;
}
