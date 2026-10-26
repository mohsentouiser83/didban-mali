"use client";
import { ControlLabel, fieldIcon } from "@/components/ui/field-layout";
import { FormMessage } from "@/components/ui/form";
import { ActionTooltip } from "@/components/ui/tooltip";
import { ErrorState, toJalaliDate } from "@/components/ui/financial";

import Link from "next/link";
import { useId, useState } from "react";
import type { DateRange } from "@/lib/financial-periods";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Button } from "@/components/ui/button";
import { Calendar, Settings, RotateCcw } from "@/components/ui/icons";
import { Drawer, DrawerForm, DrawerFooter } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePeriodSelection } from "./use-financial-periods";
type Props = { companyId: string; range: DateRange; onChange: (range: DateRange) => void; canWrite: boolean; includeUpcomingMonth?: boolean };
export function FinancialPeriodSelector(props: Props) {
  const selection = usePeriodSelection(props.companyId, props.range, props.onChange, props.includeUpcomingMonth);
  return <PeriodSelectionView {...props} selection={selection} />;
}
function PeriodSelectionView({ companyId, range, includeUpcomingMonth, selection: s }: Props & { selection: ReturnType<typeof usePeriodSelection> }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <section className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--ds-card-radius)] border border-border bg-card p-4" aria-label="انتخاب دوره مالی">
    <div className="flex min-w-0 items-center gap-3"><Calendar size={20} aria-hidden="true" className="shrink-0 text-primary" /><div><h2 className="text-sm text-muted-foreground">دوره گزارش</h2><p key={`${range.start_date}:${range.end_date}`} className="mt-1 text-sm font-medium motion-safe:animate-[metric-update_240ms_ease-out_both]">{s.selectedLabel} <span className="mx-1 text-muted-foreground">·</span> {toJalaliDate(range.start_date)} — {toJalaliDate(range.end_date)}</p></div></div>
    <div className="flex w-full gap-2 sm:w-auto"><Button variant="outline" onClick={() => { s.resetDraft(); setOpen(true); }} aria-haspopup="dialog">تغییر دوره</Button><ActionTooltip content="بازنشانی به ماه جاری"><Button variant="ghost" size="icon" aria-label="بازنشانی دوره به ماه جاری" onClick={s.reset}><RotateCcw size={18} aria-hidden="true" /></Button></ActionTooltip></div>
    <Drawer open={open} onOpenChange={setOpen} title="انتخاب دوره گزارش">
      <DrawerForm onSubmit={(event) => { event.preventDefault(); if (s.valid) { s.apply(); setOpen(false); } }}>
        <div className="space-y-2"><ControlLabel htmlFor={`${id}-choice`} className="text-sm" icon={fieldIcon("دوره گزارش")}>دوره گزارش</ControlLabel><Select value={s.choice} onValueChange={s.choose}><SelectTrigger id={`${id}-choice`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">ماه جاری</SelectItem><SelectItem value="quarter">فصل جاری</SelectItem><SelectItem value="year">سال جاری</SelectItem>{includeUpcomingMonth && <SelectItem value="upcomingMonth">یک ماه آینده</SelectItem>}{s.periods.map((period) => <SelectItem value={period.id} key={period.id}>{period.name}</SelectItem>)}<SelectItem value="custom">بازه دلخواه</SelectItem></SelectContent></Select></div>
        <div className="grid gap-4 motion-safe:animate-[workspace-enter_220ms_ease-out_both]">
          <div className="space-y-2"><ControlLabel htmlFor={`${id}-from`} className="text-sm" icon={fieldIcon("از تاریخ")}>از تاریخ</ControlLabel><PersianDatePicker id={`${id}-from`} value={s.draft.start_date} onValueChange={(start_date) => s.setDraft({ ...s.draft, start_date })} required /></div>
          <div className="space-y-2"><ControlLabel htmlFor={`${id}-to`} className="text-sm" icon={fieldIcon("تا تاریخ")}>تا تاریخ</ControlLabel><PersianDatePicker id={`${id}-to`} value={s.draft.end_date} min={s.draft.start_date} onValueChange={(end_date) => s.setDraft({ ...s.draft, end_date })} required /></div>
        </div>
        {!s.valid && <FormMessage>تاریخ پایان باید بعد از شروع و بازه حداکثر دو سال باشد.</FormMessage>}
        {s.error && <ErrorState onRetry={s.refresh} variant="compact" >دوره‌ها دریافت نشد.</ErrorState>}
        <Button asChild variant="ghost" className="justify-start"><Link href={`/companies/${companyId}/financial-periods`}><Settings size={16} aria-hidden="true" />مدیریت دوره‌ها</Link></Button>
        <DrawerFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>انصراف</Button><Button type="submit" disabled={!s.valid}>نمایش گزارش</Button></DrawerFooter>
      </DrawerForm>
    </Drawer>
  </section>;
}
