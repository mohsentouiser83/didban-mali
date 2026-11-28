"use client";
import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { BooksIcon, PlusIcon } from "@phosphor-icons/react";
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
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { ColumnFilteredTable, type ListColumn } from "@/components/ui/column-filtered-table";
import {
  TableCell,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import { useJournalDrafts } from "@/hooks/use-accounting";
import { useWorkspace } from "@/hooks/workspace";
import { amount, displayDate, persian } from "@/lib/utils";
import { JournalDraftForm } from "./journal-draft-form";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { DocumentDiscussionButton } from "./document-discussion-button";

const draftKind: Record<string, string> = {
  manual: "دستی",
  reversal: "برگشت",
  replacement: "جایگزین",
  purchase_goods: "خرید کالا",
  sale_goods: "فروش کالا",
  treasury_receipt: "دریافت خزانه",
  treasury_payment: "پرداخت خزانه",
};

export function AccountingView({ reviewDraftId }: { reviewDraftId?: string } = {}) {
  const workspace = useWorkspace();
  if (!workspace.company) return <NoCompany />;
  return (
    <JournalWorkspace key={`${workspace.user?.id}:${workspace.company.id}`} reviewDraftId={reviewDraftId} />
  );
}

function JournalWorkspace({ reviewDraftId }: { reviewDraftId?: string }) {
  const view = useJournalDrafts();
  const posting = usePosting(view.refresh);
  const details = useJournalDetails(view.refresh);
  const canSelect = !!view.capabilities.data?.can_post && view.capabilities.data.posting_available;

  type Row = (typeof view.rows)[number];
  const statusLabel = (draft: Row) => draft.state === "posted" ? "ثبت‌شده"
    : draft.state === "discarded" ? "کنارگذاشته‌شده" : "پیش‌نویس";
  const kindLabel = (draft: Row) => draftKind[draft.operation_kind || "manual"] ?? "عملیاتی";
  const columns: ListColumn<Row>[] = [
    ...(canSelect ? [{ label: "انتخاب" }] : []),
    { label: "شماره / مرجع", value: (draft) => draft.reference || "—" },
    { label: "شرح سند", value: (draft) => draft.description },
    { label: "نوع سند", value: kindLabel },
    { label: "تاریخ", value: (draft) => displayDate(draft.date) },
    { label: "بدهکار (ریال)", numeric: true, value: (draft) => amount(draft.totals.totalDebit) },
    { label: "وضعیت", value: statusLabel },
    { label: "عملیات", srOnly: true },
  ];

  return (
    <>
      <PageHeader
        title="اسناد حسابداری"
        icon={BooksIcon}
        action={
          view.canPrepare ? (
            <Button onClick={() => view.open(null)} disabled={view.loading}>
              <PlusIcon size={18} aria-hidden />
              سند جدید
            </Button>
          ) : undefined
        }
      />

      <Panel>
        {(reviewDraftId && canSelect || canSelect && posting.selected.length > 0) && (
          <div className="mb-4 flex flex-wrap gap-2">
            {reviewDraftId && canSelect && (
              <Button variant="secondary" busy={posting.loading} onClick={() => void posting.review([reviewDraftId])}>
                بررسی پیش‌نویس
              </Button>
            )}
            {view.capabilities.data?.can_post &&
              view.capabilities.data.posting_available &&
              posting.selected.length > 0 && (
                <Button
                  disabled={!posting.selected.length}
                  busy={posting.loading}
                  onClick={() => void posting.review(posting.selected)}
                >
                  بررسی و ثبت منتخب‌ها ({persian(posting.selected.length)})
                </Button>
              )}
          </div>
        )}

        <FormMessage error>{posting.error?.message}</FormMessage>

        {view.loading ? (
          <LoadingState label="در حال دریافت اسناد" variant="table" />
        ) : view.error ? (
          <ErrorState message={view.error.message} />
        ) : (
          <ColumnFilteredTable
            label="فهرست اسناد"
            columns={columns}
            rows={view.rows}
            emptyTitle="هنوز سندی ثبت نشده است"
            renderRow={(draft) => (
              <TableRow key={draft.id}>
                {canSelect && (
                  <TableCell>
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
                  </TableCell>
                )}
                <TableCell><bdi>{draft.reference || "—"}</bdi></TableCell>
                <TableRowHeader>
                  <span className="block max-w-sm break-words font-medium text-foreground">
                    {draft.description}
                  </span>
                </TableRowHeader>
                <TableCell>{kindLabel(draft)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {displayDate(draft.date)}
                </TableCell>
                <TableCell numeric className="whitespace-nowrap">
                  {amount(draft.totals.totalDebit)}
                </TableCell>
                <TableCell>
                  <Badge
                    tone={
                      draft.state === "posted" ? "success" : "warning"
                    }
                  >
                    {statusLabel(draft)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DocumentDiscussionButton
                    subjectKind="draft"
                    subjectId={draft.id}
                    renderTrigger={(openDiscussion) => (
                      <TableRowActions label={`عملیات ${draft.description}`}>
                        <TableRowAction
                          kind={view.canPrepare && draft.state === "draft" && !draft.inventory_origin ? "edit" : "view"}
                          onClick={() => draft.state === "posted" ? details.open(draft) : view.open(draft)}
                        >
                          {view.canPrepare && draft.state === "draft" && !draft.inventory_origin ? "ویرایش" : "مشاهده"}
                        </TableRowAction>
                        {draft.state === "draft" &&
                          view.capabilities.data?.can_post &&
                          view.capabilities.data.posting_available && (
                            <TableRowAction
                              kind="approve"
                              disabled={posting.loading}
                              onClick={() => void posting.review([draft.id])}
                            >
                              ثبت نهایی
                            </TableRowAction>
                          )}
                        <TableRowAction onClick={openDiscussion}>گفت‌وگو و پیگیری</TableRowAction>
                        {view.canPrepare && draft.state === "draft" && (
                          <TableRowAction
                            kind="delete"
                            danger
                            onClick={() => view.openDiscard(draft)}
                          >
                            حذف پیش‌نویس
                          </TableRowAction>
                        )}
                      </TableRowActions>
                    )}
                  />
                </TableCell>
              </TableRow>
            )}
          />
        )}
      </Panel>

      <JournalDraftForm
        key={view.editing === undefined ? "closed" : view.editing?.id ?? "new"}
        view={view}
        showNavigation={false}
      />
      <PostingReviewDialog view={posting} />
      <JournalDetailsDrawer view={details} drafts={view} />
      <ConfirmDialog
        title="حذف پیش‌نویس سند"
        open={!!view.discarding}
        onOpenChange={(open) => {
          if (!open) view.closeDiscard();
        }}
        busy={view.command.busy}
        onConfirm={view.discard}
      >
        <Field id="discard-reason" label="دلیل حذف">
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
