"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import type { Schema } from "@didban/api-client";
import { useCompany, useAccess } from "@/features/companies/use-companies";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/field";
import { formatDate } from "@/lib/dates";
import { message } from "@/lib/api";
import { formatMoney } from "@/features/results/presentation";
import {
  useWorkspaceManifests,
  useSettlementWorkspace,
  useSettlementCommands,
  usePlannedPayments,
  useRecurrences,
} from "./use-settlements";
import { canonicalMoney } from "./presentation";
import { PlansView, PlanDialog } from "./plans-view";
export function PlansController() {
  const { companyId } = useParams<{ companyId: string }>(),
    company = useCompany(companyId),
    access = useAccess(companyId),
    manifests = useWorkspaceManifests(companyId),
    plans = usePlannedPayments(companyId),
    recurrences = useRecurrences(companyId);
  const manifest = manifests.data?.at(-1),
    workspace = useSettlementWorkspace(companyId, manifest?.id);
  const [mode, setMode] = useState<
      "create" | "edit" | "cancel" | "proposal" | null
    >(null),
    [target, setTarget] = useState<Schema<"PlannedPayment"> | null>(null),
    [proposal, setProposal] = useState<Schema<"RecurrenceProposal"> | null>(
      null,
    ),
    [amountError, setAmountError] = useState<string | null>(null);
  const commands = useSettlementCommands(companyId, () => {
    setMode(null);
    setTarget(null);
    setProposal(null);
    setAmountError(null);
  });
  if (
    company.isPending ||
    access.isPending ||
    plans.isPending ||
    recurrences.isPending
  )
    return <LoadingState layout="table" />;
  const error =
    company.error || access.error || plans.error || recurrences.error;
  if (error)
    return (
      <ErrorState
        message={message(error)}
        onRetry={() => {
          void company.refetch();
          void access.refetch();
          void plans.refetch();
          void recurrences.refetch();
        }}
      />
    );
  const unit = company.data.display_unit;
  const editing = mode === "edit",
    action = editing ? commands.revisePlan : commands.createPlan;
  return (
    <>
      <PlansView
        company={company.data}
        asOf={manifest ? formatDate(manifest.as_of_date) : undefined}
        unit={unit === "IRT" ? "تومان" : "ریال"}
        canOperate={access.data.permissions.includes("company.operate")}
        busy={commands.recurrence.isPending}
        error={
          commands.recurrence.error ? message(commands.recurrence.error) : null
        }
        rows={(plans.data ?? []).map((p) => ({
          id: p.id,
          title: p.title,
          date: formatDate(p.scheduled_on),
          total: formatMoney(p.total_amount, unit),
          remaining: formatMoney(p.remaining_amount, unit),
          state:
            p.state === "cancelled"
              ? "لغوشده"
              : p.remaining_amount === null
                ? "سابقه پرداخت کافی نیست"
                : "تأییدشده",
          active: p.state === "confirmed",
        }))}
        proposals={(recurrences.data?.items ?? []).map((p) => ({
          id: p.id,
          title: p.title,
          date: formatDate(p.suggested_on),
          amount: formatMoney(p.suggested_amount, unit),
          state: {
            proposed: "پیشنهاد",
            accepted: "پذیرفته‌شده",
            rejected: "ردشده",
          }[p.state],
          proposed: p.state === "proposed",
        }))}
        onCreate={() => {
          commands.createPlan.reset();
          setAmountError(null);
          setTarget(null);
          setMode("create");
        }}
        onEdit={(id) => {
          commands.revisePlan.reset();
          setAmountError(null);
          setTarget(plans.data!.find((p) => p.id === id)!);
          setMode("edit");
        }}
        onCancel={(id) => {
          commands.cancelPlan.reset();
          setTarget(plans.data!.find((p) => p.id === id)!);
          setMode("cancel");
        }}
        onProposal={(id, choice) => {
          const p = recurrences.data!.items.find((p) => p.id === id)!;
          if (choice === "accept") {
            setProposal(p);
            setMode("proposal");
          } else commands.recurrence.mutate({ proposal: p, action: "reject" });
        }}
      />
      {mode === "create" || mode === "edit" ? (
        <PlanDialog
          key={target?.id ?? "new"}
          open
          onClose={() => setMode(null)}
          plan={target}
          invoices={(workspace.data?.invoices ?? [])
            .filter((i) => i.direction === "purchase")
            .map((i) => ({ value: i.invoice_id, label: i.source_invoice_id }))}
          busy={action.isPending}
          error={action.error ? message(action.error) : null}
          amountError={amountError}
          onSubmit={(form) => {
            const value = canonicalMoney(
              String(form.get("total_amount") ?? ""),
            );
            if (!value) {
              setAmountError("مبلغ معتبر و مثبت وارد کنید.");
              document.getElementById("plan-amount")?.focus();
              return;
            }
            setAmountError(null);
            const body = {
              title: String(form.get("title") ?? "").trim(),
              scheduled_on: String(form.get("scheduled_on")),
              total_amount: value,
              unit: String(form.get("unit")) as "IRR" | "IRT",
            };
            if (target) commands.revisePlan.mutate({ plan: target, body });
            else {
              const invoice = String(form.get("invoice_id") ?? "");
              commands.createPlan.mutate({
                ...body,
                ...(invoice && invoice !== "none"
                  ? { invoice_id: invoice }
                  : {}),
              });
            }
          }}
        />
      ) : null}
      <ConfirmDialog
        open={mode === "cancel"}
        onOpenChange={(v) => {
          if (!v) setMode(null);
        }}
        title="لغو برنامه پرداخت"
        description={target?.title ?? ""}
        busy={commands.cancelPlan.isPending}
        onConfirm={() => {
          if (target) commands.cancelPlan.mutate(target);
        }}
      >
        {commands.cancelPlan.error ? (
          <FormMessage>{message(commands.cancelPlan.error)}</FormMessage>
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={mode === "proposal"}
        onOpenChange={(v) => {
          if (!v) setMode(null);
        }}
        title="افزودن تعهد مستقل"
        description="این پرداخت در فاکتورها یا برنامه‌های موجود تکرار نشده است؟"
        busy={commands.recurrence.isPending}
        onConfirm={() => {
          if (proposal)
            commands.recurrence.mutate({ proposal, action: "accept" });
        }}
      >
        {commands.recurrence.error ? (
          <FormMessage>{message(commands.recurrence.error)}</FormMessage>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
