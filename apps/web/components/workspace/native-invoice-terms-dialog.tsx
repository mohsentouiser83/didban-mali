"use client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/input";
import { ErrorState, LoadingState, EmptyState } from "@/components/ui/content-states";
import type { NativeInvoicesController } from "@/hooks/use-native-invoices";
import { amount, displayDate } from "@/lib/utils";
export function NativeInvoiceTermsDialog({ view }: { view: NativeInvoicesController }) {
  const editor = view.editor;
  return <Drawer open={!!editor} onOpenChange={open => { if (!open) view.closeTerms(); }} title={editor?.id ? "اصلاح موعد و وعدهٔ پرداخت" : "تکمیل شرایط فاکتور خدمات"} footer={<Button busy={view.command.busy} disabled={!view.canSaveTerms} onClick={view.saveTerms}>ذخیرهٔ شرایط</Button>}>
    {editor && <div className="space-y-5">
      {!editor.id && (view.candidates.loading ? <LoadingState label="در حال دریافت اسناد خدمات" /> : view.candidates.error ? <ErrorState message={view.candidates.error.message} onRetry={view.candidates.refresh} /> : !view.candidateOptions.length ? <EmptyState title="سند خدمات تأییدشدهٔ بدون فاکتور موجود نیست" /> : <Field id="native-invoice-operation" label="سند خدمات تأییدشده"><Select id="native-invoice-operation" value={editor.operationId} onValueChange={view.selectCandidate} options={view.candidateOptions} disabled={view.command.busy} /></Field>)}
      {view.selectedCandidate && <p className="text-sm text-muted">{view.selectedCandidate.party_id} · {displayDate(view.selectedCandidate.date)} · {amount(view.selectedCandidate.amount)} ریال</p>}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-3"><Field id="native-invoice-due" label="سررسید"><PersianDatePicker id="native-invoice-due" value={editor.terms.due_date} onChange={due_date => view.changeTerms({ due_date })} disabled={view.command.busy || editor.terms.due_unknown} /></Field><Checkbox checked={editor.terms.due_unknown} onCheckedChange={checked => view.changeTerms({ due_unknown: !!checked, due_date: checked ? "" : editor.terms.due_date })} label="سررسید نامشخص است" /></div>
        <div className="space-y-3"><Field id="native-invoice-expected-mode" label="مبنای تاریخ مورد انتظار"><Select id="native-invoice-expected-mode" value={editor.terms.expected_mode} onValueChange={view.selectExpectedMode} options={[{value:"date",label:"تاریخ مشخص"},{value:"history",label:view.direction === "sale" ? "برآورد از سابقهٔ وصول" : "برنامه‌ریزی بر اساس سررسید"},{value:"unknown",label:"تاریخ نامشخص؛ نتیجهٔ محدود"}]} disabled={view.command.busy}/></Field>{editor.terms.expected_mode === "date" && <Field id="native-invoice-expected" label="تاریخ مورد انتظار دریافت یا پرداخت"><PersianDatePicker id="native-invoice-expected" value={editor.terms.expected_date} onChange={expected_date => view.changeTerms({ expected_date })} disabled={view.command.busy}/></Field>}</div>
      </div>
      {editor.id && <><Field id="native-invoice-effective" label="تاریخ اثر اصلاح شرایط"><PersianDatePicker id="native-invoice-effective" value={editor.terms.effective_date} onChange={effective_date => view.changeTerms({ effective_date })} disabled={view.command.busy} /></Field><Field id="native-invoice-reason" label="دلیل اصلاح"><Textarea id="native-invoice-reason" value={editor.terms.reason} onChange={event => view.changeTerms({ reason: event.target.value })} disabled={view.command.busy} maxLength={1000} /></Field></>}
      <FormMessage error>{view.command.error?.message}</FormMessage>
    </div>}
  </Drawer>;
}
