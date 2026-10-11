"use client";

import { useEffect, useId, useState } from "react";
import { api } from "@/lib/product-api";
import { currentRange, validRange, type DateRange, type FinancialPeriod } from "@/lib/financial-periods";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toJalaliDate } from "@/components/ui/financial";
import styles from "./financial-period-selector.module.css";

export function FinancialPeriodSelector({ companyId, range, onChange, canWrite }: {
  companyId: string; range: DateRange; onChange: (range: DateRange) => void; canWrite: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(range);
  const [name, setName] = useState("");
  const [periods, setPeriods] = useState<FinancialPeriod[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setDraft({ start_date: range.start_date, end_date: range.end_date }); }, [range.start_date, range.end_date]);
  useEffect(() => {
    let active = true;
    setPeriods([]); setError(""); setLoading(true); setName("");
    api<FinancialPeriod[]>(`/companies/${companyId}/financial-periods`)
      .then((rows) => { if (active) setPeriods(rows); })
      .catch((err: Error) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, retry]);
  const valid = validRange(draft);
  async function save() {
    if (!valid || !name.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const period = await api<FinancialPeriod>(`/companies/${companyId}/financial-periods`, { method: "POST", body: JSON.stringify({ ...draft, name: name.trim() }) });
      setPeriods((rows) => [period, ...rows]); setName(""); onChange(draft);
    } catch (err) { setError(err instanceof Error ? err.message : "ذخیره دوره انجام نشد."); }
    finally { setBusy(false); }
  }
  const selected = periods.find((p) => p.start_date === range.start_date && p.end_date === range.end_date);
  return <section className={styles.panel} aria-label="انتخاب دوره مالی">
    <div className={styles.presets}>
      {([ ["month", "ماه جاری"], ["quarter", "فصل جاری"], ["year", "سال جاری"] ] as const).map(([kind, label]) => <Button key={kind} variant="ghost" size="sm" disabled={busy} onClick={() => onChange(currentRange(kind))}>{label}</Button>)}
      <Select value={selected?.id ?? "custom"} disabled={loading || busy} onValueChange={(value) => { const period = periods.find((p) => p.id === value); if (period) onChange({ start_date: period.start_date, end_date: period.end_date }); }}>
        <SelectTrigger aria-label="دوره‌های ذخیره‌شده" className="w-56"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="custom">بازه دلخواه</SelectItem>{periods.map((period) => <SelectItem key={period.id} value={period.id}>{period.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); if (valid) onChange(draft); }}>
      <div className={styles.field}><label htmlFor={`${id}-from`}>از تاریخ</label><PersianDatePicker id={`${id}-from`} value={draft.start_date} onValueChange={(start_date) => setDraft((value) => ({ ...value, start_date }))} required disabled={busy} /></div>
      <div className={styles.field}><label htmlFor={`${id}-to`}>تا تاریخ</label><PersianDatePicker id={`${id}-to`} value={draft.end_date} min={draft.start_date} onValueChange={(end_date) => setDraft((value) => ({ ...value, end_date }))} required disabled={busy} /></div>
      <Button type="submit" disabled={!valid || busy}>نمایش گزارش</Button>
    </form>
    {!valid && <p role="alert" className={styles.error}>بازه معتبر و حداکثر دو سال انتخاب کنید.</p>}
    {canWrite && <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className={styles.field}><label htmlFor={`${id}-name`}>نام دوره</label><Input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="مثلاً نیمه اول ۱۴۰۵" disabled={busy} required /></div>
      <Button type="submit" variant="outline" disabled={!valid || !name.trim() || busy}>{busy ? "در حال ذخیره…" : "ذخیره دوره برای این شرکت"}</Button>
    </form>}
    <p className={styles.caption}>گزارش از {toJalaliDate(range.start_date)} تا {toJalaliDate(range.end_date)} · مانده ابتدای دوره: پایان روز قبل از شروع</p>
    {error && <div role="alert" className={styles.error}>{error} <Button variant="ghost" size="sm" onClick={() => setRetry((value) => value + 1)}>دریافت دوباره دوره‌ها</Button></div>}
  </section>;
}
