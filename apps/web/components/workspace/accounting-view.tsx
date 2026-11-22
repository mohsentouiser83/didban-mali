"use client";
import { useState } from "react";
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
import { amount, displayDate, persian, cn } from "@/lib/utils";
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
  const [filterState, setFilterState] = useState<"all" | "draft" | "posted" | "discarded">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const canSelect = !!view.capabilities.data?.can_post && view.capabilities.data.posting_available;
  const draftCount = view.rows.filter((r) => r.state === "draft").length;

  const filteredRows = view.rows.filter((draft) => {
    if (filterState !== "all" && draft.state !== filterState) return false;
    if (searchQuery.trim() && !draft.description.toLowerCase().includes(searchQuery.trim().toLowerCase())) return false;
    return true;
  });

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
              label="جستجو در شرح اسناد"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 text-xs"
            />
            <div className="inline-flex rounded-control border border-border/80 bg-canvas/60 p-0.5 text-xs">
              {(
                [
                  { key: "all", label: "همه" },
                  { key: "draft", label: "در انتظار ثبت", count: draftCount },
                  { key: "posted", label: "ثبت‌شده" },
                  { key: "discarded", label: "کنارگذاشته" },
                ] as Array<{
                  key: "all" | "draft" | "posted" | "discarded";
                  label: string;
                  count?: number;
                }>
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilterState(f.key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors",
                    filterState === f.key
                      ? "bg-surface text-primary font-medium shadow-xs"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  <span>{f.label}</span>
                  {typeof f.count === "number" && f.count > 0 && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                      {persian(f.count)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

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
              <Table>
                <TableHeader sticky>
                  <TableRow>
                    {canSelect && <TableHead className="w-12">انتخاب</TableHead>}
                    <TableHead>شرح سند</TableHead>
                    <TableHead className="w-32">تاریخ</TableHead>
                    <TableHead numeric className="w-40">بدهکار (ریال)</TableHead>
                    <TableHead className="w-32">وضعیت</TableHead>
                    <TableHead className="w-40">
                      <span className="sr-only">عملیات</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length ? (
                    filteredRows.map((draft) => (
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
                        <TableRowHeader>
                          <span className="block max-w-sm break-words font-medium text-foreground">
                            {draft.description}
                          </span>
                        </TableRowHeader>
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
                      colSpan={canSelect ? 6 : 5}
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

      <JournalDraftForm view={view} />
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
