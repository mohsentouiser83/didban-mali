"use client";
import { useState } from "react";
import { useManualGroups, type ManualGroupController } from "@/hooks/use-manual-groups";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Form } from "@/components/ui/form";
import { Field, FormMessage } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import {
  EmptyState, ErrorState, LoadingState, StatusMessage,
} from "@/components/ui/content-states";
import { CursorPagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/badge";
import { amount } from "@/lib/utils";
import { EvidenceList } from "./evidence-list";
import { ManualGroupSelection } from "./manual-group-selection";
import type { ManualGroupPreview } from "@/hooks/use-manual-groups";
import type { useCommand } from "@/hooks/use-command";

interface GroupReviewController {
  workspace: { canWrite: boolean };
  current: { preview: ManualGroupPreview | null; reason: string };
  selectedDateLabels: string;
  command: ReturnType<typeof useCommand>;
  canAccept: boolean;
  canDecide: boolean;
  setReason: (value: string) => void;
  decide: (value: "accepted" | "rejected") => void;
  refreshSelected: () => void;
}
export function GroupPreviewReview({ view, ledgerLabel = "جمع دفتر (ریال)", bookProofHref, evidenceRefs }: {
  view: GroupReviewController;
  ledgerLabel?: string;
  bookProofHref?: string;
  evidenceRefs?: string[];
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const item = view.current.preview;
  if (!item) return null;
  return (
    <section className="space-y-4 rounded-control border border-border p-4">
      <h3 className="font-medium">پیش‌نمایش انتخاب‌های ثبت‌شده</h3>
      <StatusBadge status={item.status} />
      <dl className="grid grid-cols-2 gap-4">
        <div><dt>جمع بانک (ریال)</dt><dd>{amount(item.snapshot.bank_total)}</dd></div>
        <div><dt>{ledgerLabel}</dt><dd>{amount(item.snapshot.ledger_total)}</dd></div>
        <div><dt>اختلاف (ریال)</dt><dd>{amount(item.snapshot.difference)}</dd></div>
      </dl>
      <p className="text-sm text-muted">تاریخ‌های انتخابی: {view.selectedDateLabels}</p>
      <StatusMessage>
        انتخاب دستی و برابری مبلغ، ارتباط تراکنش‌ها را ثابت نمی‌کند؛ دلیل بررسی لازم است.
      </StatusMessage>
      {item.snapshot.reason_codes.includes("date_mismatch") && (
        <StatusMessage>تاریخ ثبت‌های انتخابی یکسان نیست.</StatusMessage>
      )}
      {item.snapshot.reason_codes.includes("shared_reference_missing") && (
        <StatusMessage>مرجع مشترک وجود ندارد؛ ارتباط باید با شواهد بررسی شود.</StatusMessage>
      )}
      {item.snapshot.reason_codes.includes("party_missing") && (
        <StatusMessage>طرف حساب برخی ردیف‌ها نامشخص است؛ هویت حدس زده نشده است.</StatusMessage>
      )}
      {!item.snapshot.can_accept && (
        <StatusMessage>جمع دو طرف برابر نیست؛ اختلاف، کارمزد فرض نمی‌شود.</StatusMessage>
      )}
      {!item.current && (
        <StatusMessage>نسخهٔ داده یا تطبیق تغییر کرده؛ فقط برگشت تصمیم قبلی مجاز است.</StatusMessage>
      )}
      <Button variant="secondary" onClick={() => setEvidenceOpen(!evidenceOpen)}>
        {evidenceOpen ? "بستن شواهد" : "مشاهده اصل شواهد"}
      </Button>
      {bookProofHref && <ButtonLink download href={bookProofHref} variant="secondary">نسخهٔ ثابت دفتر دیدبان</ButtonLink>}
      {evidenceOpen && <EvidenceList evidence={evidenceRefs || item.snapshot.evidence_refs} />}
      <p dir="ltr" className="break-all font-mono text-xs text-muted">{item.digest}</p>
      {view.workspace.canWrite && (
        <Form
          fieldErrors={view.command.error?.fields}
          onSubmit={event => { event.preventDefault(); view.decide("accepted"); }}
        >
          <Field id="manual-group-reason" label="دلیل بررسی">
            <Textarea
              id="manual-group-reason" required maxLength={500}
              value={view.current.reason} disabled={view.command.busy}
              onChange={event => view.setReason(event.target.value)}
            />
          </Field>
          <FormMessage error>{view.command.error?.message}</FormMessage>
          {view.command.error?.code === "version_conflict" && (
            <Button variant="secondary" onClick={view.refreshSelected}>بازخوانی تصمیم</Button>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={view.command.busy} disabled={!view.canAccept}>
              پذیرش همین گروه
            </Button>
            <Button variant="secondary" disabled={!view.canDecide} onClick={() => view.decide("rejected")}>
              رد / برگشت پذیرش
            </Button>
          </div>
        </Form>
      )}
    </section>
  );
}

function ManualHistory({ view }: { view: ManualGroupController }) {
  return (
    <section className="space-y-3">
      <h3 className="font-medium">گروه‌های دستی ذخیره‌شده</h3>
      {view.history.loading ? (
        <LoadingState label="در حال دریافت گروه‌های دستی" />
      ) : view.history.error ? (
        <ErrorState message={view.history.error.message} onRetry={view.history.refresh} />
      ) : !view.historyRows.length ? (
        <EmptyState compact title="گروه دستی ذخیره نشده" />
      ) : (
        <div className="space-y-2">
          {view.historyRows.map(item => (
            <Button
              key={item.id} variant="secondary" className="w-full justify-between"
              disabled={view.command.busy} onClick={() => view.view(item)}
            >
              <span>{item.label}</span>
              <StatusBadge status={item.status} />
            </Button>
          ))}
        </div>
      )}
      <CursorPagination {...view.history} />
    </section>
  );
}

export function ManualGroupMatches({
  runId, onDecided,
}: {
  runId: string;
  onDecided: () => void;
}) {
  const view = useManualGroups(runId, onDecided);
  return (
    <>
      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={view.openPanel}>انتخاب دستی گروه</Button>
      </div>
      <Drawer
        title="انتخاب دستی گروه بانک و دفتر" open={view.open}
        onOpenChange={open => { if (!open) view.close(); }}
      >
        <div className="space-y-6">
          {view.workspace.canWrite && (
            <Button variant="secondary" disabled={view.command.busy} onClick={view.reset}>
              انتخاب تازه
            </Button>
          )}
          <ManualGroupSelection view={view} side="bank" />
          <ManualGroupSelection view={view} side="ledger" />
          {view.workspace.canWrite && (
            <Button busy={view.command.busy} disabled={!view.canPreview} onClick={view.preview}>
              ساخت پیش‌نمایش همین انتخاب‌ها
            </Button>
          )}
          {!view.current.preview && <FormMessage error>{view.command.error?.message}</FormMessage>}
          <GroupPreviewReview key={view.current.preview?.id || "empty"} view={view} />
          <ManualHistory view={view} />
        </div>
      </Drawer>
    </>
  );
}
