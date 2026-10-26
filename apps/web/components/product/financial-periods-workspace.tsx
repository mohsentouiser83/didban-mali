"use client";
import { ControlLabel, fieldIcon } from "@/components/ui/field-layout";
import { FormMessage } from "@/components/ui/form";
import { EmptyState, ErrorState, toJalaliDate } from "@/components/ui/financial";

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableRowHeader } from "@/components/ui/table";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerForm, DrawerFooter } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { PageHeader } from "@/components/ui/financial/page-header";
import { Calendar, Plus, Pencil, Trash2 } from "@/components/ui/icons";
import type { Company } from "@/lib/product-types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePeriodManagement } from "./use-period-management";

type Controller = ReturnType<typeof usePeriodManagement>;
export function FinancialPeriodsWorkspace({ company }: { company: Company }) {
  const canWrite = ["owner", "finance_manager", "advisor"].includes(company.role ?? "");
  const controller = usePeriodManagement(company.id, canWrite);
  return <FinancialPeriodsView controller={controller} canWrite={canWrite} />;
}
function FinancialPeriodsView({ controller: c, canWrite }: { controller: Controller; canWrite: boolean }) {
  return <div dir="rtl" className="grid min-w-0 gap-5">
    <PageHeader title="دوره‌های مالی" primaryAction={canWrite ? <Button onClick={() => c.edit("new")}><Plus size={18} aria-hidden="true" />دوره جدید</Button> : undefined} />
    {c.error && <ErrorState onRetry={c.refresh} variant="compact" >{c.error}</ErrorState>}
    <section aria-label="دوره‌های مالی شرکت" className="min-w-0 overflow-hidden rounded-[var(--ds-card-radius)] border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><h2 className="text-lg font-bold">دوره‌های شرکت</h2><SearchInput label="جستجوی دوره" placeholder="جستجوی دوره" value={c.search} onChange={(event) => c.setSearch(event.target.value)} className="w-full sm:w-56" /></div>
      <div className="min-w-0"><Table className="min-w-[480px]" containerClassName="border-0">
        <TableHeader className="bg-muted/40 text-muted-foreground"><TableRow><TableHead scope="col">نام دوره</TableHead><TableHead scope="col">شروع</TableHead><TableHead scope="col">پایان</TableHead><TableHead scope="col">عملیات</TableHead></TableRow></TableHeader>
        <TableBody loading={c.loading}>{c.loading ? [0,1,2].map((row) => <TableRow key={row}>{[0,1,2,3].map((cell) => <TableCell key={cell}><Skeleton className="h-5 w-24" /></TableCell>)}</TableRow>) : c.items.map((period) => <TableRow key={period.id} className="transition-colors hover:bg-muted/30 motion-reduce:transition-none"><TableRowHeader scope="row" className="font-medium">{period.name}</TableRowHeader><TableCell>{toJalaliDate(period.start_date)}</TableCell><TableCell>{toJalaliDate(period.end_date)}</TableCell><TableCell>{canWrite ? <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={`ویرایش ${period.name}`} onClick={() => c.edit(period)}><Pencil size={18} aria-hidden="true" /></Button><Button variant="ghost" size="icon" aria-label={`حذف ${period.name}`} onClick={() => c.requestDelete(period)}><Trash2 size={18} /></Button></div> : "—"}</TableCell></TableRow>)}</TableBody>
      </Table></div>
      {!c.loading && !c.items.length && <EmptyState variant="compact" title={c.search ? "دوره‌ای پیدا نشد." : "دوره‌ای ثبت نشده است."} action={canWrite && !c.search ? { label: "دوره جدید", onClick: () => c.edit("new") } : undefined} />}
    </section>
    <PeriodEditor controller={c} />
    <ConfirmDialog open={!!c.deleting} onOpenChange={(open) => { if (!open) c.cancelDelete(); }} title="حذف دوره مالی" description={`دوره «${c.deleting?.name ?? ""}» حذف شود؟`} busy={c.busy} onConfirm={() => void c.remove()} />
  </div>;
}
function PeriodEditor({ controller: c }: { controller: Controller }) {
  const id = useId();
  return <Drawer open={!!c.editing} onOpenChange={(open) => { if (!open) c.close(); }} title={c.editing === "new" ? "دوره جدید" : "ویرایش دوره"}>
    <DrawerForm onSubmit={(event) => { event.preventDefault(); void c.save(); }}>
      <div className="space-y-2"><ControlLabel className="text-sm" htmlFor={`${id}-name`} icon={fieldIcon("نام دوره")}>نام دوره</ControlLabel><Input id={`${id}-name`} required maxLength={120} value={c.draft.name} disabled={c.busy} onChange={(event) => c.setDraft((draft) => ({ ...draft, name: event.target.value }))} /></div>
      <div className="space-y-2"><ControlLabel className="text-sm" htmlFor={`${id}-start`} icon={fieldIcon("از تاریخ")}>از تاریخ</ControlLabel><PersianDatePicker id={`${id}-start`} value={c.draft.start_date} required disabled={c.busy} onValueChange={(start_date) => c.setDraft((draft) => ({ ...draft, start_date }))} /></div>
      <div className="space-y-2"><ControlLabel className="text-sm" htmlFor={`${id}-end`} icon={fieldIcon("تا تاریخ")}>تا تاریخ</ControlLabel><PersianDatePicker id={`${id}-end`} value={c.draft.end_date} min={c.draft.start_date} required disabled={c.busy} onValueChange={(end_date) => c.setDraft((draft) => ({ ...draft, end_date }))} /></div>
      {c.error && <FormMessage>{c.error}</FormMessage>}
      <DrawerFooter><Button type="submit" disabled={c.busy}>{c.busy ? "در حال ذخیره…" : "ذخیره دوره"}</Button><Button type="button" variant="outline" disabled={c.busy} onClick={c.close}>انصراف</Button></DrawerFooter>
    </DrawerForm>
  </Drawer>;
}
