"use client";
import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { useState } from "react";
import { BooksIcon, ChartLineUpIcon } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Textarea } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { CursorPagination } from "@/components/ui/pagination";
import { Tabs } from "@/components/ui/tabs";
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
    <NativeJournalsWorkspace key={`${w.user?.id}:${w.company.id}`} />
  ) : (
    <NoCompany />
  );
}
export function NativeJournalsWorkspace({ hideHeader = false }: { hideHeader?: boolean }) {
  const c = useNativeJournals();
  const drafts = useJournalDrafts(false);
  const opening = useOpeningEvidence(c.balance.refresh);
  const [activeTab, setActiveTab] = useState<"journals" | "balance">("journals");
  return (
    <>
      {!hideHeader && (
        <PageHeader
          title="دفتر اصلی دیدبان"
          icon={BooksIcon}
        />
      )}
      <div className="mb-4">
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          items={[
            { id: "journals", label: "اسناد نهایی", icon: BooksIcon },
            { id: "balance", label: "گردش حساب‌های دفتر اصلی", icon: ChartLineUpIcon },
          ]}
        />
      </div>
      {activeTab === "journals" ? (
        <Panel title="اسناد نهایی">
          {c.journals.loading ? (
            <LoadingState />
          ) : c.journals.error ? (
            <ErrorState
              message={c.journals.error.message}
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
                        <TableRowHeader>{item.snapshot.number ?? persian(item.sequence)}</TableRowHeader>
                        <TableCell>{item.snapshot.description}</TableCell>
                        <TableCell>{displayDate(item.date)}</TableCell>
                        <TableCell>
                          <TableRowActions label={`عملیات ${item.snapshot.number ?? persian(item.sequence)}`}>
                            <TableRowAction onClick={() => c.setSelected(item)} kind="view">جزئیات</TableRowAction>
                            {c.capabilities.data?.can_prepare &&
                              !item.reversal_of && (
                                <>
                                  <TableRowAction onClick={() => c.openReversal(item)} kind="reverse">تهیه برگشت</TableRowAction>
                                  {!item.snapshot.inventory && (
                                    <TableRowAction onClick={() => drafts.prepareReplacement(item)}>تهیه جایگزین</TableRowAction>
                                  )}
                                </>
                              )}
                          </TableRowActions>
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
      ) : (
        <BookBalance c={c} />
      )}
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
      <Drawer
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
          <Field id="reversal-date" label="تاریخ برگشت" required>
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
      </Drawer>
      <JournalDraftForm
        key={drafts.editing === undefined ? "closed" : drafts.editing?.id ?? "new"}
        view={drafts}
      />
      <OpeningEvidenceDialog c={opening} />
    </>
  );
}
function BookBalance({ c }: { c: ReturnType<typeof useNativeJournals> }) {
  return (
    <Panel
      title="گردش حساب‌های دفتر اصلی"
      className="mt-5"
    >
      {c.balance.loading ? (
        <LoadingState />
      ) : c.balance.error ? (
        <ErrorState
          message={c.balance.error.message}
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
