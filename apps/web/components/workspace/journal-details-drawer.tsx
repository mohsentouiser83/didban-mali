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
import { Textarea } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import type { useJournalDetails } from "@/hooks/use-journal-details";
import type { useJournalDrafts } from "@/hooks/use-accounting";
import { displayDate, persian } from "@/lib/utils";
import { DocumentDiscussionButton } from "./document-discussion-button";
import { JournalPostingLines } from "./journal-posting-lines";

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
        />
      ) : !journal ? (
        <StatusMessage>سند نهایی دریافت نشد.</StatusMessage>
      ) : (
        <div className="space-y-5">
          <p>{journal.snapshot.description}</p>
          <p className="text-sm text-muted">
            سند {journal.snapshot.number ?? persian(journal.sequence)} · {displayDate(journal.date)} · ثبت
            نهایی
          </p>
          <JournalPostingLines lines={journal.snapshot.lines} />
          <DocumentDiscussionButton
            subjectKind="journal"
            subjectId={journal.id}
          />
          {drafts.canPrepare && !journal.reversal_of && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={view.openReversal}>
                برگشت سند
              </Button>
              {!journal.snapshot.inventory && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    view.close();
                    drafts.prepareReplacement(journal);
                  }}
                >
                  اصلاح با سند جایگزین
                </Button>
              )}
            </div>
          )}
          {view.correcting && (
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                view.saveReversal();
              }}
            >
              <Field id="document-reversal-date" label="تاریخ برگشت" required>
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
