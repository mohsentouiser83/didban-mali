"use client";

import { PlusIcon, ReceiptIcon, ShieldCheckIcon, WalletIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Table, TableBody, TableCell, TableEmptyCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { amount, displayDate, persian } from "@/lib/utils";
import { Panel } from "../page-parts";
import { creditStatusLabel, quarantineStatusLabel, parseBigIntSafe } from "@/hooks/use-commercial-documents";
import type { useCommercialDocuments } from "@/hooks/use-commercial-documents";

export function CommercialDocumentLists({ view }: { view: Pick<ReturnType<typeof useCommercialDocuments>,
    "workspace" |
    "isSale" |
    "subTab" |
    "setSubTab" |
    "quarantine" |
    "credits" |
    "cmd" |
    "setDecidingQuarantine" |
    "setCreditAction" |
    "setQDecision" |
    "setQNote" |
    "setQCostAccountId" |
    "setCreditTargetDocId" |
    "setCreditAmount" |
    "setCreditCashAccount" |
    "setCreditCpAccount" |
    "setCreditReason" |
    "cpNames" |
    "findRoleAccount" |
    "openCreateDrawer" |
    "docRows" |
    "quarantineRows" |
    "creditRows"
  > }) {
  const {
    workspace,
    isSale,
    subTab,
    setSubTab,
    quarantine,
    credits,
    cmd,
    setDecidingQuarantine,
    setCreditAction,
    setQDecision,
    setQNote,
    setQCostAccountId,
    setCreditTargetDocId,
    setCreditAmount,
    setCreditCashAccount,
    setCreditCpAccount,
    setCreditReason,
    cpNames,
    findRoleAccount,
    openCreateDrawer,
    docRows,
    quarantineRows,
    creditRows,
  } = view;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          variant="segmented"
          ariaLabel="بخش‌های بازرگانی چندردیفی"
          value={subTab}
          onChange={setSubTab}
          items={[
            { id: "documents", label: `اسناد تجاری (${persian(docRows.length)})`, icon: ReceiptIcon },
            { id: "quarantine", label: `قرنطینه معیوب (${persian(quarantineRows.length)})`, icon: ShieldCheckIcon },
            { id: "credits", label: `اعتبار طرف‌حساب (${persian(creditRows.length)})`, icon: WalletIcon },
          ]}
        />
        {workspace.canWrite && subTab === "documents" && (
          <Button onClick={openCreateDrawer}>
            <PlusIcon size={16} aria-hidden />
            {isSale ? "ثبت فاکتور فروش چندردیفی" : "ثبت فاکتور خرید چندردیفی"}
          </Button>
        )}
      </div>
      {subTab === "quarantine" && (
        <Panel title="اقلام مرجوعی معیوب در قرنطینه">
          {quarantine.loading ? (
            <LoadingState variant="panels" />
          ) : quarantine.error ? (
            <ErrorState message={quarantine.error.message} onRetry={quarantine.refresh} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>سند مرجوعی</TableHead>
                    <TableHead>کالا</TableHead>
                    <TableHead>انبار مبدا</TableHead>
                    <TableHead>تعداد</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>اقدام</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quarantineRows.length ? (
                    quarantineRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableRowHeader dir="ltr" className="font-mono">
                          {row.return_number}
                          {row.document_number && (
                            <span className="block text-xs text-muted">{row.document_number}</span>
                          )}
                        </TableRowHeader>
                        <TableCell>{row.description}</TableCell>
                        <TableCell>
                          <ButtonLink
                            variant="ghost"
                            className="h-auto px-1 py-0.5 text-xs"
                            href="/accounting/inventory"
                          >
                            {row.warehouse_name || "موجودی انبار"}
                          </ButtonLink>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {persian(row.quantity)} {row.unit}
                        </TableCell>
                        <TableCell>{displayDate(row.return_date)}</TableCell>
                        <TableCell>
                          <Badge>{quarantineStatusLabel[row.quarantine_status] ?? row.quarantine_status}</Badge>
                        </TableCell>
                        <TableCell>
                          {workspace.canWrite && row.quarantine_status === "pending_inspection" && (
                            <Button
                              className="min-h-8 px-3 text-xs"
                              variant="secondary"
                              onClick={() => {
                                cmd.clearError();
                                setQDecision("restocked");
                                setQNote("");
                                setQCostAccountId(findRoleAccount("expense"));
                                setDecidingQuarantine(row);
                              }}
                            >
                              تعیین تکلیف
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableEmptyCell colSpan={7} title="مورد معیوبی در انتظار بررسی نیست." />
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>
      )}
      {subTab === "credits" && (
        <Panel title="اعتبار و بستانکاری‌های ناشی از مرجوعی طرف‌حساب">
          {credits.loading ? (
            <LoadingState variant="panels" />
          ) : credits.error ? (
            <ErrorState message={credits.error.message} onRetry={credits.refresh} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نوع</TableHead>
                    <TableHead>طرف حساب</TableHead>
                    <TableHead>مرجع فاکتور / برگشت</TableHead>
                    <TableHead numeric>مبلغ اولیه (ریال)</TableHead>
                    <TableHead numeric>مصرف‌شده (ریال)</TableHead>
                    <TableHead numeric>مانده قابل استفاده (ریال)</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>اقدام</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {creditRows.length ? (
                    creditRows.map((c) => {
                      const consumed =
                        c.consumed_amount_irr ??
                        (parseBigIntSafe(c.original_amount_irr) - parseBigIntSafe(c.remaining_amount_irr)).toString();
                      return (
                        <TableRow key={c.id}>
                          <TableRowHeader>
                            {c.credit_kind === "customer_credit" ? "بستانکاری مشتری" : "مطالبه از تأمین‌کننده"}
                          </TableRowHeader>
                          <TableCell>
                            <ButtonLink
                              variant="ghost"
                              className="h-auto px-1 py-0.5 text-xs"
                              href={`/reconciliation/counterparties?party_id=${encodeURIComponent(c.counterparty_id)}`}
                            >
                              {c.counterparty_name || cpNames[c.counterparty_id] || c.counterparty_id}
                            </ButtonLink>
                          </TableCell>
                          <TableCell className="text-xs">
                            <span dir="ltr" className="font-mono">
                              {c.document_number || c.document_id.slice(0, 8)}
                            </span>
                            {c.return_number && (
                              <span className="block text-muted">برگشت: {c.return_number}</span>
                            )}
                            {c.applications && c.applications.length > 0 && (
                              <span className="block text-muted">
                                اعمال به:{" "}
                                {c.applications
                                  .map((a) => `${a.target_document_number || a.target_document_id.slice(0, 8)} (${amount(a.amount_irr)})`)
                                  .join("، ")}
                              </span>
                            )}
                          </TableCell>
                          <TableCell numeric className="tabular-nums">
                            {amount(c.original_amount_irr)}
                          </TableCell>
                          <TableCell numeric className="tabular-nums">
                            {amount(consumed)}
                          </TableCell>
                          <TableCell numeric className="tabular-nums">
                            {amount(c.remaining_amount_irr)}
                          </TableCell>
                          <TableCell>
                            <Badge>{creditStatusLabel[c.status] ?? c.status}</Badge>
                          </TableCell>
                          <TableCell className="flex flex-wrap gap-2">
                            {workspace.canWrite && c.remaining_amount_irr !== "0" && (
                              <>
                                <Button
                                  className="min-h-8 px-3 text-xs"
                                  variant="secondary"
                                  onClick={() => {
                                    cmd.clearError();
                                    const firstEligible = docRows.find(
                                      (d) =>
                                        d.counterparty_id === c.counterparty_id &&
                                        (d.status === "posted" || d.status === "partially_returned") &&
                                        parseBigIntSafe(d.open_balance_irr || "0") > BigInt(0),
                                    );
                                    setCreditAmount(c.remaining_amount_irr);
                                    setCreditTargetDocId(firstEligible?.id ?? "");
                                    setCreditAction({ mode: "apply", credit: c });
                                  }}
                                >
                                  اعمال به فاکتور
                                </Button>
                                <Button
                                  className="min-h-8 px-3 text-xs"
                                  variant="secondary"
                                  onClick={() => {
                                    cmd.clearError();
                                    setCreditAmount(c.remaining_amount_irr);
                                    setCreditCashAccount(findRoleAccount("cash_bank", "bank", "cash"));
                                    setCreditCpAccount(
                                      findRoleAccount(c.credit_kind === "customer_credit" ? "trade_receivable" : "trade_payable"),
                                    );
                                    setCreditReason("");
                                    setCreditAction({ mode: "refund", credit: c });
                                  }}
                                >
                                  پیش‌نویس استرداد
                                </Button>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableEmptyCell colSpan={8} title="اعتبار بازی ثبت نشده است." />
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
