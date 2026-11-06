"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Form } from "@/components/ui/form";
import { Field, FormMessage } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { CursorPagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { useDocumentDiscussion, type DocumentSubjectKind, type DocumentDiscussionController } from "@/hooks/use-document-discussion";
import { useWorkspace } from "@/hooks/workspace";
import { persian } from "@/lib/utils";

function ActivityForm({ view }: { view: DocumentDiscussionController }) {
  return <Form fieldErrors={view.command.error?.fields} onSubmit={event => { event.preventDefault(); view.add(); }}>
    <Field id="document-comment-kind" label="فعالیت"><Select id="document-comment-kind" value={view.comment.kind} onValueChange={kind => view.commentChange({ kind })} options={[{ value: "comment", label: "نظر" }, { value: "document_request", label: "درخواست مدرک" }]} disabled={view.command.busy}/></Field>
    <Field id="document-comment-text" label="متن"><Textarea id="document-comment-text" value={view.comment.message} onChange={event => view.commentChange({ message: event.target.value })} required maxLength={2000} disabled={view.command.busy}/></Field>
    <Button type="submit" busy={view.command.busy} disabled={view.blocked || !view.comment.message.trim()}>ثبت فعالیت</Button>
  </Form>;
}
function FollowupForm({ view }: { view: DocumentDiscussionController }) {
  return <Form className="space-y-4 rounded-control border border-border p-4" fieldErrors={view.command.error?.fields} onSubmit={event => { event.preventDefault(); view.saveFollowup(); }}>
    <h3 className="font-medium">مسئول و پیگیری</h3>
    <Field id="document-thread-state" label="وضعیت"><Select id="document-thread-state" value={view.form.state} onValueChange={state => view.formChange({ state: state as typeof view.form.state })} options={[{ value: "open", label: "باز" }, { value: "in_progress", label: "در حال رسیدگی" }, { value: "resolved", label: "رسیدگی‌شده" }]} disabled={view.command.busy}/></Field>
    <Field id="document-thread-assignee" label="مسئول"><Select id="document-thread-assignee" value={view.form.assignee_membership_id} onValueChange={assignee_membership_id => view.formChange({ assignee_membership_id })} options={view.assigneeOptions} disabled={view.command.busy || view.assignees.loading || !!view.assignees.error}/></Field>
    {view.assignees.error && <ErrorState message={view.assignees.error.message} onRetry={view.assignees.refresh}/>}
    <Field id="document-thread-due" label="مهلت پیگیری"><PersianDatePicker id="document-thread-due" value={view.form.due_date} onChange={due_date => view.formChange({ due_date })} disabled={view.command.busy}/></Field>
    <Field id="document-thread-next" label="اقدام بعدی"><Input id="document-thread-next" value={view.form.next_action} onChange={event => view.formChange({ next_action: event.target.value })} maxLength={500} disabled={view.command.busy}/></Field>
    <Field id="document-thread-reason" label="دلیل تغییر"><Textarea id="document-thread-reason" value={view.form.reason} onChange={event => view.formChange({ reason: event.target.value })} required maxLength={2000} disabled={view.command.busy}/></Field>
    <Button type="submit" busy={view.command.busy} disabled={view.blocked || !view.form.reason.trim()}>ذخیره پیگیری</Button>
  </Form>;
}
function Discussion({ subjectKind, subjectId, label }: { subjectKind: DocumentSubjectKind; subjectId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const view = useDocumentDiscussion(subjectKind, subjectId, open);
  return <>
    <Button variant="secondary" onClick={() => setOpen(true)}>{label}</Button>
    <Drawer title="گفت‌وگو و پیگیری سند" open={open} onOpenChange={value => { if (!view.command.busy) setOpen(value); }}>
      {view.resource.loading ? <LoadingState label="در حال دریافت گفت‌وگوی سند"/> : view.resource.error ? <ErrorState message={view.resource.error.message} onRetry={view.resource.refresh}/> : view.resource.data && <div className="space-y-5">
        <p className="font-medium">{view.resource.data.subject.description}</p>
        <p className="text-sm text-muted">نسخه سند {persian(view.resource.data.subject.version)}</p>
        {view.resource.data.thread && <div className="flex flex-wrap items-center gap-2"><Badge>{view.resource.data.thread.assignee_name || "بدون مسئول"}</Badge>{view.resource.data.thread.assignee_name && !view.resource.data.thread.assignee_active && <StatusMessage>دسترسی مسئول فعلی غیرفعال است.</StatusMessage>}</div>}
        {view.canWrite && <ActivityForm view={view}/>}
        <section className="space-y-3"><h3 className="font-medium">سابقه گفتگو</h3>
          {view.history.loading ? <LoadingState label="در حال دریافت فعالیت‌ها"/> : view.history.error ? <ErrorState message={view.history.error.message} onRetry={view.history.refresh}/> : !view.activities.length ? <EmptyState compact title="فعالیتی ثبت نشده"/> : <ol className="space-y-3">{view.activities.map(item => <li key={item.id} className="space-y-2 rounded-control border border-border p-3"><p className="text-xs text-muted">{item.label} · {item.actor_name} · {item.timeLabel}</p><p className="whitespace-pre-wrap break-words">{item.message}</p><p className="text-xs text-muted">نسخه سند {persian(item.context.version)}</p></li>)}</ol>}
          <CursorPagination {...view.history}/>
        </section>
        {view.canWrite && <FollowupForm view={view}/>}
        <FormMessage error>{view.command.error?.message}</FormMessage>
        {view.blocked && <Button variant="secondary" onClick={view.refresh}>بازخوانی سند و گفتگو</Button>}
      </div>}
    </Drawer>
  </>;
}
export function DocumentDiscussionButton({ subjectKind, subjectId, label = "گفت‌وگو و پیگیری" }: { subjectKind: DocumentSubjectKind; subjectId: string; label?: string }) {
  const workspace = useWorkspace();
  return <Discussion key={`${workspace.user?.id}:${workspace.company?.id}:${subjectKind}:${subjectId}`} subjectKind={subjectKind} subjectId={subjectId} label={label}/>;
}
