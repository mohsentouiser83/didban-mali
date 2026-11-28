"use client";

import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { ReceiptIcon, PlusIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { DetailField } from "@/components/ui/field-layout";
import { ColumnFilteredTable, type ListColumn } from "@/components/ui/column-filtered-table";
import { TableCell, TableRow, TableRowHeader } from "@/components/ui/table";
import { useInvoiceList, type InvoiceListRow } from "@/hooks/use-invoice-list";
import { useWorkspace } from "@/hooks/workspace";
import { moduleAllows } from "@/lib/module-access";
import { amount, displayDate } from "@/lib/utils";
import { CommercialAdjustmentEditors } from "./commercial/commercial-adjustment-editors";
import { CommercialDocumentLists } from "./commercial/commercial-document-lists";
import { CommercialDocumentEditor } from "./commercial/commercial-document-editor";
import { CounterpartyProfileDrawer, CounterpartyQuickDrawer } from "./commercial/counterparty-profile-drawer";
import { NativeInvoiceAllocationDialog } from "./native-invoice-allocation-dialog";
import { NativeInvoiceDetail } from "./native-invoice-detail";
import { NativeInvoiceReminderDialog } from "./native-invoice-reminder-dialog";
import { NativeInvoiceSourceDialog } from "./native-invoice-source-dialog";
import { NativeInvoiceTermsDialog } from "./native-invoice-terms-dialog";
import { NoCompany, PageHeader, Panel } from "./page-parts";

interface InvoicePageProps {
  direction: "sales" | "purchases";
  operationId?: string;
  partyId?: string;
  initialReference?: string;
}

export function InvoicesView(props: InvoicePageProps) {
  const { company, user } = useWorkspace();
  return company ? (
    <InvoiceList key={JSON.stringify([user?.id, company.id, props])} {...props} />
  ) : <NoCompany />;
}

function InvoiceList({ direction, operationId, partyId, initialReference }: InvoicePageProps) {
  const { rows, native, commercial, imported, selected, setSelected } = useInvoiceList(direction, operationId);
  const unit = imported.workspace.unit;
  const canCreate = moduleAllows(native.workspace.company, "commercial", "create", native.workspace.canWrite);
  const title = direction === "sales" ? "فاکتورهای فروش" : "فاکتورهای خرید";
  const formattedAmount = (value: string | null) => amount(value, unit);
  const unitLabel = unit === "IRR" ? "ریال" : "تومان";
  const columns: ListColumn<InvoiceListRow>[] = [
    { label: "شماره / مرجع", value: (row) => row.reference },
    { label: "منبع", value: (row) => row.origin },
    { label: "تاریخ", value: (row) => displayDate(row.date) },
    { label: "طرف‌حساب", value: (row) => row.party },
    { label: "سررسید", value: (row) => displayDate(row.due) },
    { label: "وعدهٔ پرداخت", value: (row) => row.expected },
    { label: `مبلغ (${unitLabel})`, numeric: true, value: (row) => formattedAmount(row.amount) },
    { label: `مانده (${unitLabel})`, numeric: true, value: (row) => formattedAmount(row.balance) },
    { label: "وضعیت", value: (row) => row.status },
    { label: "عملیات", srOnly: true },
  ];
  const resources = [native.report, commercial.docs, imported];
  const loading = resources.some((resource) => resource.loading);
  const preferredInvoice = native.preferredInvoice;
  const reference = initialReference || (preferredInvoice && (
    rows.find(({ source }) => source.kind === "commercial" && source.native?.id === preferredInvoice.id)?.reference
    ?? preferredInvoice.reference
  ));

  function open(row: InvoiceListRow) {
    const { source } = row;
    if (source.kind === "native") native.select(source.invoice.id);
    if (source.kind === "imported") setSelected(source.invoice);
    if (source.kind === "commercial") {
      commercial.cmd.clearError();
      commercial.setRetQuantities({});
      commercial.setRetConditions({});
      commercial.setRetReason("");
      commercial.setDetailDoc(source.invoice);
    }
  }

  return (
    <>
      <PageHeader title={title} icon={ReceiptIcon} action={
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <>
              {direction === "sales" ? (
                <ButtonLink href="/receivables/new"><PlusIcon size={18} aria-hidden />فاکتور جدید</ButtonLink>
              ) : (
                <Button onClick={commercial.openCreateDrawer}><PlusIcon size={18} aria-hidden />فاکتور جدید</Button>
              )}
              {!!native.candidateOptions.length && (
                <Button variant="secondary" onClick={() => native.openTerms()}>
                  {native.preferredCandidate ? `ثبت فاکتور از سند ${native.preferredCandidate.reference}` : "ثبت فاکتور از سند حسابداری"}
                </Button>
              )}
            </>
          )}
        </div>
      } />
      <Panel>
        {resources.map((resource, index) => resource.error && (
          <ErrorState key={index} message={resource.error.message} />
        ))}
        {loading ? <LoadingState variant="table" label="در حال دریافت فاکتورها" /> : (
          <ColumnFilteredTable
            label={title}
            columns={columns}
            rows={rows}
            emptyTitle="هنوز فاکتوری ثبت نشده است"
            initialFilters={{
              ...(reference ? { 0: { textCondition: reference } } : {}),
              ...(partyId ? { 3: { selectedValues: new Set(rows.filter((row) => row.partyIds.includes(partyId)).map((row) => row.party)) } } : {}),
            }}
            renderRow={(row) => (
              <TableRow key={row.id}>
                <TableRowHeader><bdi>{row.reference}</bdi></TableRowHeader>
                <TableCell>{row.origin}</TableCell>
                <TableCell className="whitespace-nowrap">{displayDate(row.date)}</TableCell>
                <TableCell>{row.party}</TableCell>
                <TableCell className="whitespace-nowrap">{displayDate(row.due)}</TableCell>
                <TableCell className="whitespace-nowrap">{row.expected}</TableCell>
                <TableCell numeric className="whitespace-nowrap">{formattedAmount(row.amount)}</TableCell>
                <TableCell numeric className="whitespace-nowrap">
                  {formattedAmount(row.balance)}
                  {row.reason && <span className="block text-xs text-muted">{row.reason}</span>}
                </TableCell>
                <TableCell><Badge>{row.status}</Badge></TableCell>
                <TableCell>
                  <TableRowActions label={`عملیات ${row.reference}`}>
                    <TableRowAction onClick={() => open(row)} kind="view">جزئیات</TableRowAction>
                    {row.source.kind === "commercial" && row.source.native && (
                      <TableRowAction
                        onClick={() => {
                            if (row.source.kind === "commercial" && row.source.native)
                                native.select(row.source.native.id);
                        }}
                        kind="view"
                      >
                        جزئیات دفتر
                      </TableRowAction>
                    )}
                  </TableRowActions>
                </TableCell>
              </TableRow>
            )}
          />
        )}
      </Panel>
      <Drawer title="جزئیات فاکتور ورودی" open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && (
          <dl className="space-y-4">
            <DetailField label="شماره فاکتور" value={selected.reference} />
            <DetailField label="طرف‌حساب" value={selected.party_id} />
            <DetailField label="تاریخ صدور" value={displayDate(selected.date)} />
            <DetailField label="سررسید" value={displayDate(selected.due_date)} />
            <DetailField label={`مبلغ (${unitLabel})`} value={formattedAmount(selected.amount)} />
            <DetailField label={`مانده (${unitLabel})`} value={formattedAmount(selected.remaining)} />
            {selected.reason && <StatusMessage>{selected.reason}</StatusMessage>}
          </dl>
        )}
      </Drawer>
      <NativeInvoiceDetail view={native} listMode />
      <NativeInvoiceSourceDialog view={native} />
      <NativeInvoiceReminderDialog view={native} />
      <NativeInvoiceTermsDialog view={native} />
      <NativeInvoiceAllocationDialog view={native} />
      {direction === "purchases" && <CommercialDocumentEditor view={commercial} />}
      <CommercialAdjustmentEditors view={commercial}>
        {commercial.detailDoc && commercial.detailDoc.status !== "draft" && (
          <CommercialDocumentLists view={commercial} documentId={commercial.detailDoc.id} />
        )}
      </CommercialAdjustmentEditors>
      <CounterpartyQuickDrawer
        open={commercial.partyQuickCreateOpen}
        initialMode="create"
        onOpenChange={commercial.setPartyQuickCreateOpen}
        onCreated={(party) => {
          commercial.counterparties.refresh();
          commercial.setPartyId(party.id);
        }}
      />
      {commercial.viewingParty && (
        <CounterpartyProfileDrawer showNavigation={false} party={commercial.viewingParty} onClose={() => commercial.setViewingParty(null)} />
      )}
    </>
  );
}
