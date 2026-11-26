"use client";
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
import { CursorPagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
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
  const { filterState, setFilterState, searchQuery, setSearchQuery } = view;
  const canSelect = !!view.capabilities.data?.can_post && view.capabilities.data.posting_available;

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
        {/* Action & Filter bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              label="جست‌وجو در شماره، مرجع یا شرح سند"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 text-xs"
            />
            <div className="flex flex-wrap gap-1">
              {([
                ["all", "همه"],
                ["draft", "در انتظار ثبت"],
                ["posted", "ثبت‌شده"],
                ["discarded", "کنارگذاشته"],
              ] as const).map(([state, label]) => (
                <Button
                  key={state}
                  variant={filterState === state ? "primary" : "ghost"}
                  aria-pressed={filterState === state}
                  onClick={() => setFilterState(state)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

            {reviewDraftId && canSelect && (
              <Button variant="secondary" busy={posting.loading} onClick={() => void posting.review([reviewDraftId])}>
                بررسی پیش‌نویس دستیار
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

          <FormMessage error>{posting.error?.message}</FormMessage>

          {view.loading ? (
            <LoadingState label="در حال دریافت اسناد" variant="table" />
          ) : view.error ? (
            <ErrorState message={view.error.message} onRetry={view.refresh} />
          ) : (
            <>
              <Table showSearch={false}>
                <TableHeader sticky>
                  <TableRow>
                    {canSelect && <TableHead className="w-12">انتخاب</TableHead>}
                    <TableHead>شماره / مرجع</TableHead>
                    <TableHead>شرح سند</TableHead>
                    <TableHead>نوع سند</TableHead>
                    <TableHead className="w-32">تاریخ</TableHead>
                    <TableHead numeric className="w-40">بدهکار (ریال)</TableHead>
                    <TableHead className="w-32">وضعیت</TableHead>
                    <TableHead className="w-40">
                      <span className="sr-only">عملیات</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.rows.length ? (
                    view.rows.map((draft) => (
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
                        <TableCell>{draftKind[draft.operation_kind || "manual"] ?? "عملیاتی"}</TableCell>
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
                            {draft.state === "posted"
                              ? "ثبت‌شده"
                              : draft.state === "discarded"
                                ? "کنارگذاشته‌شده"
                                : "پیش‌نویس"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              variant="secondary"
                              className="h-8 text-xs"
                              onClick={() =>
                                draft.state === "posted"
                                  ? details.open(draft)
                                  : view.open(draft)
                              }
                            >
                              {view.canPrepare && draft.state === "draft" && !draft.inventory_origin
                                ? "ویرایش"
                                : "مشاهده"}
                            </Button>
                            {draft.state === "draft" &&
                              view.capabilities.data?.can_post &&
                              view.capabilities.data.posting_available && (
                                <Button
                                  variant="secondary"
                                  className="h-8 text-xs"
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
                                className="h-8 text-xs text-danger hover:bg-danger-soft"
                                onClick={() => view.openDiscard(draft)}
                              >
                                حذف پیش‌نویس
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableEmptyCell
                      colSpan={canSelect ? 8 : 7}
                      title={
                        searchQuery || filterState !== "all"
                          ? "سندی با این فیلتر یا جستجو پیدا نشد"
                          : "هنوز سندی ثبت نشده است"
                      }
                      action={
                        searchQuery || filterState !== "all" ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setSearchQuery("");
                              setFilterState("all");
                            }}
                          >
                            پاک‌کردن فیلترها
                          </Button>
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

      <JournalDraftForm
        key={view.editing === undefined ? "closed" : view.editing?.id ?? "new"}
        view={view}
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
