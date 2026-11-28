"use client";
import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { ArrowsLeftRightIcon as HeaderIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  ArrowsLeftRightIcon,
  TextAaIcon,
  ArrowUpLeftIcon,
} from "@phosphor-icons/react";
import type { ReconciliationCandidate } from "@/lib/api";
import { useReconciliation } from "@/hooks/use-reconciliation";
import { Pagination } from "@/components/ui/pagination";
import { Button, ButtonLink } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Field, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { StatusBadge } from "@/components/ui/badge";
import {
  LoadingState,
  ErrorState,
  EmptyState,
  StatusMessage,
} from "@/components/ui/content-states";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  TableRowHeader,
  TableEmptyCell,
} from "@/components/ui/table";
import { PageHeader, Panel, NoCompany } from "./page-parts";
import { EvidenceList } from "./evidence-list";
import { GroupMatchesPanel } from "./group-matches-panel";
import { amount, displayDate, persian } from "@/lib/utils";
import { useReconciliationBasis } from "@/hooks/use-reconciliation-basis";
import { NativeBankMatchesPanel } from "./native-bank-matches-panel";
import { CounterpartyReconciliationPanel } from "./counterparty-reconciliation-panel";
import { MoadianReconciliationPanel } from "./moadian-reconciliation-panel";
export function ImportedReconciliationWorkspace() {
  const view = useReconciliation();
  const [mappingOpen, setMappingOpen] = useState(false);
  const [selected, setSelected] = useState<ReconciliationCandidate | null>(
    null,
  );
  const [decision, setDecision] = useState<"accepted" | "rejected">("accepted");
  const [reason, setReason] = useState("");
  if (!view.workspace.company) return <NoCompany />;
  return (
    <>
      <Panel
        title="نتیجه تطبیق"
        action={
          (view.workspace.canWrite || !!view.options.data) && (
            <Button
              disabled={view.command.busy}
              onClick={() => {
                view.command.clearError();
                setMappingOpen(true);
              }}
            >
              {view.workspace.canWrite ? "تطبیق جدید" : "مشاهده ارتباط حساب‌ها"}
            </Button>
          )
        }
      >
        {view.latest.loading ? (
          <LoadingState />
        ) : view.latest.error ? (
          <ErrorState
            message={view.latest.error.message}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>مرجع</TableHead>
                <TableHead>حساب بانک</TableHead>
                <TableHead>حساب دفتر</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>
                  مبلغ ({view.workspace.unit === "IRR" ? "ریال" : "تومان"})
                </TableHead>
                <TableHead>نتیجه</TableHead>
                <TableHead>
                  <span className="sr-only">عملیات</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.candidates.length ? (
                view.candidates.map((candidate) => (
                  <TableRow key={candidate.id}>
                    <TableRowHeader>
                      {candidate.reference || "—"}
                    </TableRowHeader>
                    <TableCell>{candidate.bank_account}</TableCell>
                    <TableCell>
                      {candidate.group_basis === "native_book" ? (
                        <>
                          <p>{candidate.group_ledger_account || "—"}</p>
                          <p className="text-xs text-muted">دفتر دیدبان</p>
                        </>
                      ) : (
                        candidate.ledger_account || "—"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {displayDate(candidate.date)}
                    </TableCell>
                    <TableCell>
                      {amount(candidate.amount, view.workspace.unit)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={candidate.status} />
                    </TableCell>
                    <TableCell>
                      <TableRowActions label={`عملیات ${candidate.reference}`}>
                        <TableRowAction
                          aria-label="بررسی شواهد تطبیق"
                          onClick={() => {
                              setSelected(candidate);
                              setDecision("accepted");
                              setReason("");
                              view.command.clearError();
                          }}
                          icon={<ArrowUpLeftIcon size={18} />}
                        >
                          بررسی شواهد تطبیق
                        </TableRowAction>
                      </TableRowActions>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell colSpan={7} title="هنوز موردی برای تطبیق ثبت نشده است" />
              )}
            </TableBody>
          </Table>
        )}
        <Pagination
          page={view.page}
          total={view.total}
          onPrevious={view.previousPage}
          onNext={view.nextPage}
        />
      </Panel>
      <Drawer
        title="ارتباط حساب‌های بانک و دفتر"
        open={mappingOpen}
        onOpenChange={(open) => {
          if (!view.command.busy) setMappingOpen(open);
        }}
      >
        {view.options.loading ? (
          <LoadingState />
        ) : view.options.error ? (
          <ErrorState
            message={view.options.error.message}
          />
        ) : !view.options.data ? (
          <Panel>
            <EmptyState
              title="اطلاعات لازم برای تطبیق موجود نیست"
            />
          </Panel>
        ) : (
          <div>
            <Form
              fieldErrors={view.command.error?.fields}
              onSubmit={(event) => {
                event.preventDefault();
                void view.create(() => setMappingOpen(false));
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                {view.options.data.bank_accounts.map((bank) => (
                  <Field
                    key={bank}
                    id={`bank-map-${bank}`}
                    label={bank}
                    icon={ArrowsLeftRightIcon}
                  >
                    <Select
                      id={`bank-map-${bank}`}
                      value={view.selectedMapping[bank] || "none"}
                      onValueChange={(account) =>
                        view.setMapping(bank, account === "none" ? "" : account)
                      }
                      options={[
                        { value: "none", label: "بدون ارتباط" },
                        ...view.options.data!.ledger_accounts.map(
                          (account) => ({
                            value: account.account,
                            label: account.account,
                          }),
                        ),
                      ]}
                      disabled={!view.workspace.canWrite || view.command.busy}
                    />
                  </Field>
                ))}
              </div>
              <FormMessage error>{view.command.error?.message}</FormMessage>
              {view.workspace.canWrite && (
                <Button type="submit" busy={view.command.busy}>
                  اجرای تطبیق
                </Button>
              )}
            </Form>
          </div>
        )}
      </Drawer>
      {view.latest.data && (
        <GroupMatchesPanel
          key={view.workspace.company?.id + view.latest.data.id}
          runId={view.latest.data.id}
          onDecided={view.latest.refresh}
        />
      )}
      <Drawer
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !view.command.busy) setSelected(null);
        }}
        title="شواهد تطبیق"
      >
        {selected && (
          <div className="space-y-5">
            <StatusBadge status={view.groupDetails(selected).status} />
            {view.isGrouped(selected) && (
              <StatusMessage>
                این گردش در یک گروه{" "}
                {view.groupDetails(selected).group_basis === "native_book"
                  ? "دفتر دیدبان "
                  : ""}
                پذیرفته شده؛ تغییر تصمیم از همان گروه انجام می‌شود.
              </StatusMessage>
            )}
            {view.nativeGroupExport(selected) && (
              <ButtonLink
                download
                href={view.nativeGroupExport(selected)!}
                variant="secondary"
              >
                نسخهٔ ثابت دفتر دیدبان
              </ButtonLink>
            )}
            {selected.ledger_ids.length > 1 && (
              <StatusMessage tone="primary">
                {persian(selected.ledger_ids.length)} ردیف دفتر برای یک گردش
                بانک
              </StatusMessage>
            )}
            <EvidenceList evidence={selected.evidence_refs} />
            {view.workspace.canWrite &&
              !view.isGrouped(selected) &&
              selected.ledger_ids.length > 0 &&
              ["needs_review", "exact_proposal"].includes(selected.status) && (
                <Form
                  fieldErrors={view.command.error?.fields}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void view.decide(selected, decision, reason, () =>
                      setSelected(null),
                    );
                  }}
                >
                  <Field id="reconciliation-decision" label="تصمیم" required>
                    <Select
                      id="reconciliation-decision"
                      value={decision}
                      onValueChange={(value) =>
                        setDecision(value as "accepted" | "rejected")
                      }
                      options={[
                        { value: "accepted", label: "پذیرش تطبیق" },
                        { value: "rejected", label: "رد تطبیق" },
                      ]}
                    />
                  </Field>
                  <Field
                    id="reconciliation-reason"
                    label="دلیل"
                    icon={TextAaIcon}
                  >
                    <Textarea
                      id="reconciliation-reason"
                      required
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </Field>
                  <FormMessage error>{view.command.error?.message}</FormMessage>
                  <Button type="submit" busy={view.command.busy}>
                    ثبت تصمیم
                  </Button>
                </Form>
              )}
          </div>
        )}
      </Drawer>
    </>
  );
}

const reconciliationTitles = {
  bank: "تطبیق بانک و دفتر",
  counterparty: "تطبیق طرف‌حساب‌ها",
  moadian: "تطبیق کارپوشه مؤدیان",
};

export function ReconciliationView({
  initialTab = "bank",
  initialPartyId,
}: {
  initialTab?: "bank" | "counterparty" | "moadian";
  initialPartyId?: string;
} = {}) {
  const view = useReconciliationBasis();
  if (!view.workspace.company) return <NoCompany />;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={HeaderIcon}
        title={reconciliationTitles[initialTab]}
      />

      {initialTab === "bank" && <NativeBankMatchesPanel key={view.scope + ":native"} />}
      {initialTab === "counterparty" && <CounterpartyReconciliationPanel initialPartyId={initialPartyId} />}
      {initialTab === "moadian" && <MoadianReconciliationPanel />}
    </div>
  );
}
