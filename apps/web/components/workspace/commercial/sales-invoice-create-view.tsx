"use client";

import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, ReceiptIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/content-states";
import { FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { useCommercialDocuments } from "@/hooks/use-commercial-documents";
import { useWorkspace } from "@/hooks/workspace";
import { moduleAllows } from "@/lib/module-access";
import { amount, cn } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "../page-parts";
import { CommercialDocumentDetails } from "./commercial-document-details";
import { CommercialDocumentPayment } from "./commercial-document-payment";
import { CounterpartyProfileDrawer, CounterpartyQuickDrawer } from "./counterparty-profile-drawer";

const steps = [
  { id: "details", label: "اطلاعات فاکتور" },
  { id: "payment", label: "شرایط پرداخت" },
] as const;

export function SalesInvoiceCreateView() {
  const { user, company, canWrite } = useWorkspace();
  if (!company) return <NoCompany />;
  const canCreate = moduleAllows(company, "commercial", "create", canWrite);
  return (
    <>
      <PageHeader
        title="فاکتور فروش جدید"
        icon={ReceiptIcon}
        action={<ButtonLink href="/receivables" variant="secondary">فهرست فاکتورهای فروش</ButtonLink>}
      />
      {canCreate ? (
        <SalesInvoiceWizard key={JSON.stringify([user?.id, company.id])} />
      ) : (
        <EmptyState title="دسترسی ایجاد فاکتور فروش را ندارید." />
      )}
    </>
  );
}

function SalesInvoiceWizard() {
  const view = useCommercialDocuments({ direction: "sale", creationOnly: true });
  const router = useRouter();
  const [step, setStep] = useState<(typeof steps)[number]["id"]>("details");
  const heading = useRef<HTMLHeadingElement>(null);
  const active = useRef(false);
  const focusStep = useRef(false);
  const { cmd, clientErrors, workspace, totals } = view;
  const details = step === "details";
  const detailsLoading = view.counterparties.loading || (totals.hasGoods && view.inventory.loading);
  const accountErrors = Object.entries(clientErrors).filter(([key]) => key.endsWith("_account_id"));

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (focusStep.current) heading.current?.focus();
    focusStep.current = false;
  }, [step]);

  function changeStep(next: typeof step) {
    cmd.clearError();
    focusStep.current = true;
    setStep(next);
  }

  return (
    <>
      <Panel className="mx-auto max-w-5xl">
        <ol aria-label="مراحل ثبت فاکتور فروش" className="mb-6 grid grid-cols-2 gap-2 border-b border-border pb-5 sm:gap-4">
          {steps.map(({ id, label }, index) => {
            const current = id === step;
            const completed = id === "details" && !details;
            return (
              <li
                key={id}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-control px-2 py-2 text-xs font-medium sm:px-4 sm:text-sm",
                  current ? "bg-primary-soft text-primary" : "text-muted",
                )}
              >
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border border-current", current && "bg-primary text-white")}>
                  {completed ? <CheckIcon size={16} aria-hidden /> : index === 0 ? "۱" : "۲"}
                </span>
                <span>{label}{completed && <span className="sr-only">، تکمیل شد</span>}</span>
              </li>
            );
          })}
        </ol>
        <Form
          aria-labelledby="sales-invoice-step"
          fieldErrors={{ ...cmd.error?.fields, ...clientErrors }}
          onSubmit={(event) => {
            event.preventDefault();
            if (details) {
              if (view.validateCreateDetails()) changeStep("payment");
            } else {
              view.handleCreateDoc(
                () => { if (active.current) router.replace("/receivables"); },
                () => changeStep("details"),
              );
            }
          }}
        >
          <div key={step} className="space-y-5 motion-safe:animate-page-reveal">
            <h2 id="sales-invoice-step" ref={heading} tabIndex={-1} className="text-lg font-medium outline-none">
              {details ? steps[0].label : steps[1].label}
            </h2>
            {details ? <CommercialDocumentDetails view={view} /> : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-canvas px-4 py-3 text-sm">
                  <span>مبلغ خالص فاکتور</span>
                  <span className="font-medium tabular-nums text-primary">
                    {totals.netTotal !== null ? `${amount(totals.netTotal.toString())} ریال` : "—"}
                  </span>
                </div>
                <CommercialDocumentPayment view={view} />
                {accountErrors.length > 0 && (
                  <ul id="cd-account-errors" tabIndex={-1} className="space-y-1">
                    {accountErrors.map(([field, message]) => (
                      <li key={field}><FormMessage error>{message}</FormMessage></li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <FormMessage error>{cmd.error?.message}</FormMessage>
          {!workspace.periodId && <FormMessage error>دوره مالی را انتخاب کنید.</FormMessage>}
          <div className={cn("flex flex-wrap gap-2 border-t border-border pt-4", details ? "justify-end" : "justify-between")}>
            {!details && (
              <Button variant="secondary" disabled={cmd.busy} onClick={() => changeStep("details")}>
                <ArrowRightIcon size={16} aria-hidden /> مرحلهٔ قبل
              </Button>
            )}
            {details ? (
              <Button type="submit" disabled={detailsLoading}>
                مرحلهٔ بعد <ArrowLeftIcon size={16} aria-hidden />
              </Button>
            ) : (
              <Button type="submit" busy={cmd.busy} disabled={view.accounts.loading || Boolean(view.accounts.error) || !workspace.periodId}>
                ذخیره پیش‌نویس
              </Button>
            )}
          </div>
        </Form>
      </Panel>
      <CounterpartyQuickDrawer
        open={view.partyQuickCreateOpen}
        initialMode="create"
        onOpenChange={view.setPartyQuickCreateOpen}
        onCreated={(party) => {
          view.counterparties.refresh();
          view.setPartyId(party.id);
          view.clearClientError("party_id");
        }}
      />
      {view.viewingParty && (
        <CounterpartyProfileDrawer
          showNavigation={false}
          party={view.viewingParty}
          onClose={() => view.setViewingParty(null)}
        />
      )}
    </>
  );
}
