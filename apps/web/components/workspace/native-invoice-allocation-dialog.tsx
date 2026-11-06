"use client";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/input";
import { ErrorState, LoadingState, EmptyState } from "@/components/ui/content-states";
import type { NativeInvoicesController } from "@/hooks/use-native-invoices";
export function NativeInvoiceAllocationDialog({view}:{view:NativeInvoicesController}) {
  const editor=view.allocation;
  return <Drawer open={!!editor} onOpenChange={open=>{if(!open)view.closeAllocation();}} title={editor?.reversalId?"برگشت تخصیص":"تخصیص دریافت یا پرداخت تأییدشده"} footer={<Button onClick={view.settle} disabled={!view.canSettle} busy={view.command.busy}>{editor?.reversalId?"تأیید برگشت تخصیص":"تأیید همین تخصیص"}</Button>}>
    {editor&&<div className="space-y-4">{editor.reversalId?<Field id="native-allocation-reason" label="دلیل برگشت"><Textarea id="native-allocation-reason" value={editor.reason} onChange={event=>view.changeAllocation({reason:event.target.value})} maxLength={1000}/></Field>:view.payments.loading?<LoadingState label="در حال دریافت اسناد دریافت و پرداخت"/>:view.payments.error?<ErrorState message={view.payments.error.message} onRetry={view.payments.refresh}/>:!view.paymentOptions.length?<EmptyState title="سند دریافت یا پرداخت با ظرفیت برای این طرف حساب موجود نیست"/>:<><Field id="native-allocation-operation" label="سند تأییدشدهٔ همین طرف حساب"><Select id="native-allocation-operation" value={editor.journalId} options={view.paymentOptions} onValueChange={journalId=>view.changeAllocation({journalId})} disabled={view.command.busy}/></Field><Field id="native-allocation-amount" label="مبلغ تخصیص (ریال)"><Input id="native-allocation-amount" inputMode="decimal" value={editor.amount} onChange={event=>view.changeAllocation({amount:event.target.value})} disabled={view.command.busy}/></Field></>}
    <FormMessage error>{view.command.error?.message}</FormMessage></div>}
  </Drawer>;
}
