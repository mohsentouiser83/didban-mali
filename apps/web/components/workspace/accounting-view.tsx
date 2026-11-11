"use client";
import { BooksIcon, PackageIcon, PlusIcon } from "@phosphor-icons/react";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/field";
import { useJournalDetails } from "@/hooks/use-journal-details";
import { JournalDetailsDrawer } from "./journal-details-drawer";
import { usePosting } from "@/hooks/use-posting";
import { PostingReviewDialog } from "./posting-review-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { CursorPagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import { useJournalDrafts } from "@/hooks/use-accounting";
import { useWorkspace } from "@/hooks/workspace";
import { amount, displayDate } from "@/lib/utils";
import { JournalDraftForm } from "./journal-draft-form";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { DocumentDiscussionButton } from "./document-discussion-button";

export function AccountingView() {
  const workspace = useWorkspace();
  if (!workspace.company) return <NoCompany />;
  return (
    <JournalWorkspace key={`${workspace.user?.id}:${workspace.company.id}`} />
  );
}
function JournalWorkspace() {
  const view = useJournalDrafts();
  const posting = usePosting(view.refresh);
  const details = useJournalDetails(view.refresh);
  const canSelect = !!view.capabilities.data?.can_post && view.capabilities.data.posting_available;
  return (
    <>
      <PageHeader
        title="اسناد حسابداری"
        icon={BooksIcon}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/accounting/inventory" variant="secondary">
              <PackageIcon size={18} aria-hidden />
              کالا و انبار
            </ButtonLink>
            {view.canPrepare && (
              <Button onClick={() => view.open(null)} disabled={view.loading}>
                <PlusIcon size={18} aria-hidden />
                سند جدید
              </Button>
            )}
          </div>
        }
      />
      <Panel>
        {view.capabilities.data?.can_post &&
          view.capabilities.data.posting_available &&
          posting.selected.length > 0 && (
            <Button
              className="mb-4"
              disabled={!posting.selected.length}
              busy={posting.loading}
              onClick={() => void posting.review(posting.selected)}
            >
              بررسی و ثبت منتخب‌ها
            </Button>
          )}
        <FormMessage error>{posting.error?.message}</FormMessage>
        {view.loading ? (
          <LoadingState label="در حال دریافت اسناد" variant="panels" />
        ) : view.error ? (
          <ErrorState message={view.error.message} onRetry={view.refresh} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {canSelect && <TableHead>انتخاب</TableHead>}
                  <TableHead>شرح سند</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>بدهکار (ریال)</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>
                    <span className="sr-only">عملیات</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rows.length ? (
                  view.rows.map((draft) => (
                    <TableRow key={draft.id}>
                      {canSelect && <TableCell>
                        {draft.state === "draft" &&
                          view.capabilities.data?.can_post &&
                          view.capabilities.data.posting_available && (
                            <Checkbox
                              hideLabel
                              label={`انتخاب ${draft.description}`}
                              checked={posting.selected.includes(draft.id)}
                              onCheckedChange={(checked) =>
                                posting.toggle(draft.id, checked)
                              }
                            />
                          )}
                      </TableCell>}
                      <TableRowHeader>
                        <span className="block max-w-sm break-words">
                          {draft.description}
                        </span>
                      </TableRowHeader>
                      <TableCell className="whitespace-nowrap">
                        {displayDate(draft.date)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {amount(draft.totals.totalDebit)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          tone={
                            draft.state === "posted" ? "success" : "warning"
                          }
                        >
                          {draft.state === "posted"
                            ? "ثبت‌شده"
                            : draft.state === "discarded"
                              ? "کنارگذاشته‌شده"
                              : "پیش‌نویس"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            onClick={() =>
                              draft.state === "posted"
                                ? details.open(draft)
                                : view.open(draft)
                            }
                          >
                            {view.canPrepare && draft.state === "draft" && !draft.inventory_origin
                              ? "بررسی و ویرایش"
                              : "مشاهده"}
                          </Button>
                          {draft.state === "draft" &&
                            view.capabilities.data?.can_post &&
                            view.capabilities.data.posting_available && (
                              <Button
                                variant="secondary"
                                disabled={posting.loading}
                                onClick={() => void posting.review([draft.id])}
                              >
                                ثبت نهایی
                              </Button>
                            )}
                          <DocumentDiscussionButton
                            subjectKind="draft"
                            subjectId={draft.id}
                          />
                          {view.canPrepare && draft.state === "draft" && (
                            <Button
                              variant="ghost"
                              onClick={() => view.openDiscard(draft)}
                            >
                              کنارگذاشتن
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell
                    colSpan={canSelect ? 6 : 5}
                    title="سندی ثبت نشده"
                    action={
                      view.requiresAccounts ? (
                        <ButtonLink href="/settings/accounts">
                          تعریف حساب‌ها
                        </ButtonLink>
                      ) : view.requiresPeriod ? (
                        <ButtonLink href="/settings/periods">
                          تعریف دوره مالی
                        </ButtonLink>
                      ) : undefined
                    }
                  />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...view.drafts} />
          </>
        )}
      </Panel>
      <JournalDraftForm view={view} />
      <PostingReviewDialog view={posting} />
      <JournalDetailsDrawer view={details} drafts={view} />
      <ConfirmDialog
        title="کنارگذاشتن پیش‌نویس"
        open={!!view.discarding}
        onOpenChange={(open) => {
          if (!open) view.closeDiscard();
        }}
        busy={view.command.busy}
        onConfirm={view.discard}
      >
        <Field id="discard-reason" label="دلیل">
          <Textarea
            id="discard-reason"
            required
            value={view.discardReason}
            onChange={(event) => view.setDiscardReason(event.target.value)}
          />
        </Field>
        <FormMessage error>{view.command.error?.message}</FormMessage>
      </ConfirmDialog>
    </>
  );
}
