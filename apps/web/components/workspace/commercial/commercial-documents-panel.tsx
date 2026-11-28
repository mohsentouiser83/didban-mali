"use client";

import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/content-states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/ui/table";
import { CounterpartyProfileDrawer, CounterpartyQuickDrawer } from "./counterparty-profile-drawer";
import { amount, displayDate, persian } from "@/lib/utils";
import { Panel } from "../page-parts";
import { useCommercialDocuments, docStatusLabel } from "@/hooks/use-commercial-documents";
import { CommercialDocumentLists } from "./commercial-document-lists";
import { CommercialDocumentEditor } from "./commercial-document-editor";
import { CommercialAdjustmentEditors } from "./commercial-adjustment-editors";

export function CommercialDocumentsPanel({ direction, partyId: filteredPartyId }: { direction: "sale" | "purchase"; partyId?: string }) {
  const view = useCommercialDocuments({ direction, partyId: filteredPartyId });
  const {
    isSale,
    subTab,
    docs,
    counterparties,
    cmd,
    setDetailDoc,
    partyQuickCreateOpen,
    setPartyQuickCreateOpen,
    viewingParty,
    setViewingParty,
    setPartyId,
    setRetReason,
    setRetQuantities,
    setRetConditions,
    cpNames,
    docRows,
  } = view;

  return (
    <div className="space-y-4">
      <CommercialDocumentLists view={view} />

      {subTab === "documents" && (
        <Panel title={isSale ? "فاکتورهای فروش چندردیفی" : "فاکتورهای خرید چندردیفی"}>
          {docs.loading ? (
            <LoadingState label="در حال بارگذاری اسناد تجاری" variant="panels" />
          ) : docs.error ? (
            <ErrorState message={docs.error.message} onRetry={docs.refresh} />
          ) : !docRows.length ? (
            <EmptyState
              title="فاکتور تجاری چندردیفی ثبت نشده است"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>شماره</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>طرف حساب</TableHead>
                    <TableHead>سررسید</TableHead>
                    <TableHead numeric>مبلغ خالص (ریال)</TableHead>
                    <TableHead numeric>مانده (ریال)</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docRows.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableRowHeader className="tabular-nums font-mono" dir="ltr">
                        {doc.number}
                      </TableRowHeader>
                      <TableCell className="whitespace-nowrap">{displayDate(doc.issue_date)}</TableCell>
                      <TableCell>
                        <ButtonLink
                          variant="ghost"
                          className="h-auto px-1 py-0.5 text-sm font-normal"
                          href={`/reconciliation/counterparties?party_id=${encodeURIComponent(doc.counterparty_id)}`}
                        >
                          {doc.party_name || doc.party_snapshot?.name || cpNames[doc.counterparty_id] || "—"}
                        </ButtonLink>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {doc.due_date ? displayDate(doc.due_date) : "—"}
                      </TableCell>
                      <TableCell numeric className="tabular-nums">
                        {amount(doc.net_amount_irr)}
                        <span className="block text-xs text-muted">
                          {persian(doc.lines.length)} ردیف
                        </span>
                      </TableCell>
                      <TableCell numeric className="tabular-nums">
                        {doc.open_balance_irr != null ? amount(doc.open_balance_irr) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge tone={doc.status === "posted" ? "success" : "neutral"}>
                          {docStatusLabel[doc.status] ?? doc.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex flex-wrap gap-2">
                        <TableRowActions label={`عملیات ${doc.number}`}>
                          <TableRowAction
                            onClick={() => {
                                cmd.clearError();
                                setRetQuantities({});
                                setRetConditions({});
                                setRetReason("");
                                setDetailDoc(doc);
                            }}
                            kind="view"
                          >
                            جزئیات و مرجوعی
                          </TableRowAction>
                        {doc.draft_id && doc.status === "draft" && (
                          <TableRowAction
                            href={`/accounting?review_draft=${doc.draft_id}`}
                            kind="view"
                          >
                            بررسی و ثبت سند
                          </TableRowAction>
                        )}
                        </TableRowActions>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>
      )}

      {!isSale && <CommercialDocumentEditor view={view} />}

      <CommercialAdjustmentEditors view={view} />

      <CounterpartyQuickDrawer
        open={partyQuickCreateOpen}
        initialMode="create"
        onOpenChange={setPartyQuickCreateOpen}
        onCreated={(created) => {
          counterparties.refresh();
          setPartyId(created.id);
        }}
      />
      {viewingParty && (
        <CounterpartyProfileDrawer
          party={viewingParty}
          onClose={() => setViewingParty(null)}
        />
      )}
    </div>
  );
}
