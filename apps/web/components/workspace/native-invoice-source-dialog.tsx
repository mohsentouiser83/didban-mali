"use client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field,FormMessage } from "@/components/ui/field";
import { DetailField } from "@/components/ui/field-layout";
import { Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState,ErrorState,LoadingState,StatusMessage } from "@/components/ui/content-states";
import type { NativeInvoicesController } from "@/hooks/use-native-invoices";
import { amount,displayDate,persian } from "@/lib/utils";
export function NativeInvoiceSourceDialog({view}:{view:NativeInvoicesController}) {
 const editor=view.sourceRevision;const source=view.selectedSource;
 return <Dialog open={!!editor} onOpenChange={open=>{if(!open)view.closeSourceRevision();}} title="پذیرش سند جایگزین فاکتور" footer={<Button onClick={view.adoptSource} busy={view.command.busy} disabled={!view.canAdoptSource}>تأیید پیوند همین نسخهٔ جایگزین</Button>}>
 {editor&&<div className="space-y-5">
  {view.sourceCandidates.loading?<LoadingState label="در حال دریافت اسناد جایگزین تأییدشده"/>:view.sourceCandidates.error?<ErrorState message={view.sourceCandidates.error.message} onRetry={view.sourceCandidates.refresh}/>:!view.sourceCandidates.data?.items.length?<EmptyState title="سند جایگزین تأییدشدهٔ مرتبط موجود نیست"/>:<Field id="native-invoice-replacement" label="سند جایگزین تأییدشده"><Select id="native-invoice-replacement" value={editor.journalId} onValueChange={journalId=>view.changeSourceRevision({journalId})} options={view.sourceCandidates.data.items.map(item=>({value:item.journal_id,label:`${item.reference} · ${displayDate(item.date)} · ${amount(item.amount)} ریال`}))} disabled={view.command.busy}/></Field>}
  {source&&<dl className="grid gap-4 sm:grid-cols-2">{[["طرف حساب",source.party_id],["تاریخ سند جایگزین",displayDate(source.date)],["مبلغ جایگزین (ریال)",amount(source.amount)],["نسخهٔ تأییدشده",persian(source.approved_draft_version)]].map(([label,value])=><DetailField key={label} label={label} value={value}/>)}<div className="sm:col-span-2"><dt className="mb-2 text-sm text-muted">اثر انگشت همین سند</dt><dd className="break-all font-mono text-xs" dir="ltr">{source.journal_digest}</dd></div></dl>}
  {view.hasActiveAllocations&&<StatusMessage>ابتدا همهٔ تخصیص‌های فعال این فاکتور را برگشت دهید.</StatusMessage>}
  <Field id="native-invoice-adoption-reason" label="دلیل پذیرش سند جایگزین"><Textarea id="native-invoice-adoption-reason" value={editor.reason} onChange={event=>view.changeSourceRevision({reason:event.target.value})} maxLength={1000} disabled={view.command.busy}/></Field>
  <FormMessage error>{view.command.error?.message}</FormMessage>
 </div>}
 </Dialog>;
}
