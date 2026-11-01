"use client";
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
import { Button } from "@/components/ui/button";
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
import { amount, displayDate } from "@/lib/utils";
export function ReconciliationView() {
  const view = useReconciliation();
  const [selected, setSelected] = useState<ReconciliationCandidate | null>(
    null,
  );
  const [decision, setDecision] = useState<"accepted" | "rejected">("accepted");
  const [reason, setReason] = useState("");
  if (!view.workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader icon={HeaderIcon} title="تطبیق بانک و دفتر" />
      {view.options.loading ? (
        <LoadingState />
      ) : view.options.error ? (
        <ErrorState
          message={view.options.error.message}
          onRetry={view.options.refresh}
        />
      ) : !view.options.data ? (
        <Panel>
          <EmptyState
            title="منابع تطبیق موجود نیست"
            description="گردش بانک و دفتر حسابداری لازم است."
          />
        </Panel>
      ) : (
        <Panel title="ارتباط حساب‌های بانک و دفتر">
          <Form
            fieldErrors={view.command.error?.fields}
            onSubmit={(event) => {
              event.preventDefault();
              void view.create();
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
                      ...view.options.data!.ledger_accounts.map((account) => ({
                        value: account.account,
                        label: account.account,
                      })),
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
        </Panel>
      )}
      <Panel title="نتیجه تطبیق" className="mt-5">
        {view.latest.loading ? (
          <LoadingState />
        ) : view.latest.error ? (
          <ErrorState
            message={view.latest.error.message}
            onRetry={view.latest.refresh}
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
                  <span className="sr-only">شواهد</span>
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
                    <TableCell>{candidate.ledger_account || "—"}</TableCell>
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
                      <Button
                        variant="ghost"
                        className="size-11 p-0"
                        aria-label="بررسی شواهد تطبیق"
                        onClick={() => {
                          setSelected(candidate);
                          setReason("");
                          view.command.clearError();
                        }}
                      >
                        <ArrowUpLeftIcon size={18} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell colSpan={7} title="نتیجه تطبیقی ثبت نشده" />
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
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title="شواهد تطبیق"
      >
        {selected && (
          <div className="space-y-5">
            <StatusBadge status={selected.status} />
            <EvidenceList evidence={selected.evidence_refs} />
            {view.workspace.canWrite &&
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
                  <Field id="reconciliation-decision" label="تصمیم">
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
