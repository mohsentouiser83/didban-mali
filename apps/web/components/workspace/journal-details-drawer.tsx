"use client";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import {
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import type { useJournalDetails } from "@/hooks/use-journal-details";
import type { useJournalDrafts } from "@/hooks/use-accounting";
import { amount, displayDate, persian } from "@/lib/utils";
import { DocumentDiscussionButton } from "./document-discussion-button";

export function JournalDetailsDrawer({
  view,
  drafts,
}: {
  view: ReturnType<typeof useJournalDetails>;
  drafts: ReturnType<typeof useJournalDrafts>;
}) {
  const journal = view.journal;
  return (
    <Drawer
      title="مشاهده سند"
      open={!!view.selected}
      onOpenChange={(open) => {
        if (!open) view.close();
      }}
      className="sm:max-w-2xl"
    >
      {view.resource.loading ? (
        <LoadingState />
      ) : view.resource.error ? (
        <ErrorState
          message={view.resource.error.message}
          onRetry={view.resource.refresh}
        />
      ) : !journal ? (
        <StatusMessage>سند نهایی دریافت نشد.</StatusMessage>
      ) : (
        <div className="space-y-5">
          <p>{journal.snapshot.description}</p>
          <p className="text-sm text-muted">
            سند {persian(journal.sequence)} · {displayDate(journal.date)} · ثبت
            نهایی
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>حساب</TableHead>
                <TableHead>طرف حساب</TableHead>
                <TableHead>بدهکار (ریال)</TableHead>
                <TableHead>بستانکار (ریال)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {journal.snapshot.lines.map((line, index) => (
                <TableRow key={index}>
                  <TableRowHeader>
                    {line.code} · {line.name}
                  </TableRowHeader>
                  <TableCell>{line.party_id || "—"}</TableCell>
                  <TableCell>{amount(line.debit)}</TableCell>
                  <TableCell>{amount(line.credit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DocumentDiscussionButton
            subjectKind="journal"
            subjectId={journal.id}
          />
          {drafts.canPrepare && !journal.reversal_of && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={view.openReversal}>
                برگشت سند
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  view.close();
                  drafts.prepareReplacement(journal);
                }}
              >
                اصلاح با سند جایگزین
              </Button>
            </div>
          )}
          {view.correcting && (
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                view.saveReversal();
              }}
            >
              <StatusMessage>
                برگشت به‌صورت پیش‌نویس ساخته می‌شود و نیاز به تأیید نهایی دارد.
              </StatusMessage>
              <Field id="document-reversal-period" label="دوره مالی">
                <Select
                  id="document-reversal-period"
                  value={view.period}
                  onValueChange={view.setPeriod}
                  options={view.periods}
                />
              </Field>
              <Field id="document-reversal-date" label="تاریخ برگشت">
                <PersianDatePicker
                  id="document-reversal-date"
                  value={view.date}
                  onChange={view.setDate}
                />
              </Field>
              <Field id="document-reversal-reason" label="دلیل برگشت">
                <Textarea
                  id="document-reversal-reason"
                  required
                  value={view.reason}
                  onChange={(event) => view.setReason(event.target.value)}
                />
              </Field>
              <FormMessage error>{view.command.error?.message}</FormMessage>
              <Button
                type="submit"
                busy={view.command.busy}
                disabled={!view.date || !view.period || !view.reason.trim()}
              >
                ساخت پیش‌نویس برگشت
              </Button>
            </Form>
          )}
        </div>
      )}
    </Drawer>
  );
}
