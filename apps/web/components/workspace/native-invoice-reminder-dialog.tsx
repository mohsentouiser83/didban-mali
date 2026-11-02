"use client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field,FormMessage } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/content-states";
import type { NativeInvoicesController } from "@/hooks/use-native-invoices";
export function NativeInvoiceReminderDialog({view}:{view:NativeInvoicesController}) {
 return <Dialog open={!!view.reminder} onOpenChange={open=>{if(!open)view.closeReminder();}} title="پیش‌نویس یادآوری وصول" footer={<Button onClick={()=>void view.copyReminder()} disabled={view.command.busy||!view.reminder?.text.trim()} busy={view.command.busy}>کپی متن پس از بررسی مانده</Button>}>
   {view.reminder&&<div className="space-y-4"><Field id="native-reminder-text" label="متن قابل ویرایش"><Textarea id="native-reminder-text" value={view.reminder.text} onChange={event=>view.changeReminder(event.target.value)} maxLength={4000} rows={5}/></Field><FormMessage error>{view.reminder.error||view.command.error?.message}</FormMessage>{view.reminder.copied&&<StatusMessage>متن کپی شد.</StatusMessage>}</div>}
 </Dialog>;
}
