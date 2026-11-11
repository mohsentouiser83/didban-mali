"use client";
import { BooksIcon } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Textarea } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { Dialog } from "@/components/ui/dialog";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { CursorPagination } from "@/components/ui/pagination";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
  TableEmptyCell,
} from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { useOpeningEvidence } from "@/hooks/use-opening-evidence";
import { OpeningEvidenceDialog } from "./opening-evidence-dialog";
import { useNativeJournals } from "@/hooks/use-native-journals";
import { useJournalDrafts } from "@/hooks/use-accounting";
import { useWorkspace } from "@/hooks/workspace";
import { amount, displayDate, persian } from "@/lib/utils";
import { JournalDraftForm } from "./journal-draft-form";
import { PageHeader, Panel, NoCompany } from "./page-parts";
import { DocumentDiscussionButton } from "./document-discussion-button";
export function NativeJournalsView() {
  const w = useWorkspace();
  return w.company ? (
    <Workspace key={`${w.user?.id}:${w.company.id}`} />
  ) : (
    <NoCompany />
  );
}
function Workspace() {
  const c = useNativeJournals();
  const drafts = useJournalDrafts();
  const opening = useOpeningEvidence(c.balance.refresh);
  return (
    <>
      <PageHeader
        title="دفتر اصلی دیدبان"
        icon={BooksIcon}
        action={
          <ButtonLink href="/accounting" variant="secondary">
            اسناد و تأیید
          </ButtonLink>
        }
      />
      <Panel title="اسناد نهایی">
        {c.journals.loading ? (
          <LoadingState />
        ) : c.journals.error ? (
          <ErrorState
            message={c.journals.error.message}
            onRetry={c.journals.refresh}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>شماره</TableHead>
                  <TableHead>شرح</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.journals.data?.items.length ? (
                  c.journals.data.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableRowHeader>{persian(item.sequence)}</TableRowHeader>
                      <TableCell>{item.snapshot.description}</TableCell>
                      <TableCell>{displayDate(item.date)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => c.setSelected(item)}
                          >
                            جزئیات
                          </Button>
                          {c.capabilities.data?.can_prepare &&
                            !item.reversal_of && (
                              <>
                                <Button
                                  variant="secondary"
                                  onClick={() => c.openReversal(item)}
                                >
                                  تهیه برگشت
                                </Button>
                                {!item.snapshot.inventory && (
                                  <Button
                                    variant="secondary"
                                    onClick={() => drafts.prepareReplacement(item)}
                                  >
                                    تهیه جایگزین
                                  </Button>
                                )}
                              </>
                            )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell colSpan={4} title="سند نهایی ثبت نشده" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...c.journals} />
          </>
        )}
      </Panel>
      <BookBalance c={c} />
      <Drawer
        title="جزئیات سند نهایی"
        open={!!c.selected}
        onOpenChange={(open) => {
          if (!open) c.setSelected(null);
        }}
      >
        <div className="space-y-4">
          {c.selected && (
            <>
              <p>{c.selected.snapshot.description}</p>
              <DocumentDiscussionButton subjectKind="journal" subjectId={c.selected.id} />
              {opening.canDeclare && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (c.selected) {
                      opening.openJournal(c.selected.id, c.selected.digest);
                      c.setSelected(null);
                    }
                  }}
                >
                  تعیین این سند به‌عنوان افتتاحیه
                </Button>
              )}
              <p className="text-sm text-muted">
                نسخه تأییدشده {persian(c.selected.draft_version)}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>حساب</TableHead>
                    <TableHead>بدهکار</TableHead>
                    <TableHead>بستانکار</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.selected.snapshot.lines.map((line, index) => (
                    <TableRow key={index}>
                      <TableRowHeader>
                        {line.code} · {line.name}
                      </TableRowHeader>
                      <TableCell>{amount(line.debit)}</TableCell>
                      <TableCell>{amount(line.credit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </div>
      </Drawer>
      <Dialog
        title="تهیه پیش‌نویس برگشت"
        open={!!c.reversal}
        onOpenChange={(open) => {
          if (!open) c.closeReversal();
        }}
      >
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            c.saveReversal();
          }}
        >
          <Field id="reversal-period" label="دوره">
            <Select
              id="reversal-period"
              value={c.period}
              onValueChange={c.setPeriod}
              options={c.workspace.periods.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
          </Field>
          <Field id="reversal-date" label="تاریخ برگشت">
            <PersianDatePicker
              id="reversal-date"
              value={c.date}
              onChange={c.setDate}
            />
          </Field>
          <Field id="reversal-reason" label="دلیل">
            <Textarea
              id="reversal-reason"
              required
              value={c.reason}
              onChange={(event) => c.setReason(event.target.value)}
            />
          </Field>
          <FormMessage error>{c.command.error?.message}</FormMessage>
          <Button
            type="submit"
            busy={c.command.busy}
            disabled={!c.date || !c.reason.trim()}
          >
            ساخت پیش‌نویس برگشت
          </Button>
        </Form>
      </Dialog>
      <JournalDraftForm view={drafts} />
      <OpeningEvidenceDialog c={opening} />
    </>
  );
}
function BookBalance({ c }: { c: ReturnType<typeof useNativeJournals> }) {
  return (
    <Panel
      title="گردش حساب‌های دفتر اصلی"
      className="mt-5"
      action={
        <ButtonLink href="/reports/native" variant="secondary">
          صورت مالی دفتر دیدبان
        </ButtonLink>
      }
    >
      <Field id="native-period" label="دوره">
        <Select
          id="native-period"
          value={c.period}
          onValueChange={c.setPeriod}
          options={c.workspace.periods.map((p) => ({
            value: p.id,
            label: p.name,
          }))}
        />
      </Field>
      {c.balance.loading ? (
        <LoadingState />
      ) : c.balance.error ? (
        <ErrorState
          message={c.balance.error.message}
          onRetry={c.balance.refresh}
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>حساب / طرف</TableHead>
                <TableHead>بدهکار (ریال)</TableHead>
                <TableHead>بستانکار (ریال)</TableHead>
                <TableHead>خالص گردش (ریال)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.balance.data?.items.length ? (
                c.balance.data.items.map((row) => (
                  <TableRow key={`${row.account_id}:${row.party_id}`}>
                    <TableRowHeader>
                      {row.code} · {row.name}
                      <span className="block text-xs text-muted">
                        {row.party_id}
                      </span>
                    </TableRowHeader>
                    <TableCell>{amount(row.debit)}</TableCell>
                    <TableCell>{amount(row.credit)}</TableCell>
                    <TableCell>{amount(row.balance)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell
                  colSpan={4}
                  title="گردشی در این دوره ثبت نشده"
                />
              )}
            </TableBody>
          </Table>
          <p className="my-4 text-sm text-muted">
            مبنای این گزارش فقط اسناد نهایی دیدبان در دورهٔ انتخابی است.
          </p>
          {c.workspace.canWrite && (
            <Button
              disabled={!c.period}
              busy={c.command.busy}
              onClick={c.saveReport}
            >
              ذخیره نسخه ثابت گزارش
            </Button>
          )}
          <FormMessage error>{c.command.error?.message}</FormMessage>
        </>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {c.reportRuns.data?.items.map((run) => (
          <div key={run.id} className="flex gap-2">
            <ButtonLink
              variant="secondary"
              href={`/api/v1/companies/${c.workspace.company?.id}/accounting/trial-balance/runs/${run.id}/export?format=pdf`}
            >
              PDF · {displayDate(run.snapshot.as_of)}
            </ButtonLink>
            <ButtonLink
              variant="secondary"
              href={`/api/v1/companies/${c.workspace.company?.id}/accounting/trial-balance/runs/${run.id}/export?format=xlsx`}
            >
              Excel
            </ButtonLink>
          </div>
        ))}
      </div>
      <CursorPagination {...c.reportRuns} />
    </Panel>
  );
}
