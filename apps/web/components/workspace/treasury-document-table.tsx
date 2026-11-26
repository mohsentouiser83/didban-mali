"use client";

import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/content-states";
import { Table, TableBody, TableCell, TableEmptyCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/ui/table";
import { amount, displayDate } from "@/lib/utils";
import { Panel } from "./page-parts";
import { toolLabel, stateLabel } from "@/hooks/use-treasury-documents";
import type { useTreasuryDocuments } from "@/hooks/use-treasury-documents";

export function TreasuryDocumentTable({ view }: { view: Pick<ReturnType<typeof useTreasuryDocuments>,
    "workspace" |
    "docs" |
    "cmd" |
    "setAllocDoc" |
    "setReversingAlloc" |
    "setSelectedToolId" |
    "setSelectedInvoiceId" |
    "setAllocAmount" |
    "setReverseReason" |
    "cpNames" |
    "invNames" |
    "docRows"
  > }) {
  const {
    workspace,
    docs,
    cmd,
    setAllocDoc,
    setReversingAlloc,
    setSelectedToolId,
    setSelectedInvoiceId,
    setAllocAmount,
    setReverseReason,
    cpNames,
    invNames,
    docRows,
  } = view;
  return (
    <Panel title="فهرست اسناد خزانه و تخصیص ابزارها">
        {docs.loading ? (
          <LoadingState label="در حال بارگذاری اسناد خزانه" variant="panels" />
        ) : docs.error ? (
          <ErrorState message={docs.error.message} onRetry={docs.refresh} />
        ) : !docRows.length ? (
          <EmptyState
            title="سند خزانه‌ای ثبت نشده است"
            description="برای ثبت دریافت یا پرداخت چندابزاری (نقد، حواله، چک، کارت) پیش‌نویس سند خزانه جدید بسازید."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>شماره</TableHead>
                  <TableHead>نوع</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>طرف حساب</TableHead>
                  <TableHead>جمع مبلغ</TableHead>
                  <TableHead>قابل‌تخصیص</TableHead>
                  <TableHead>ابزارها / تخصیص و سوابق</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>اقدام</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docRows.length ? docRows.map(({ doc, allocatableVal, hasProof, canAllocate, firstAvailableTool }) => (
                  <TableRow key={doc.id}>
                    <TableRowHeader dir="ltr" className="font-mono">{doc.number}</TableRowHeader>
                    <TableCell>
                      <Badge tone={doc.direction === "receipt" ? "success" : "warning"}>
                        {doc.direction === "receipt" ? "دریافت" : "پرداخت"}
                      </Badge>
                    </TableCell>
                    <TableCell>{displayDate(doc.date)}</TableCell>
                    <TableCell>{doc.counterparty_name || cpNames[doc.counterparty_id] || doc.counterparty_id}</TableCell>
                    <TableCell className="tabular-nums">{amount(doc.total_amount)}</TableCell>
                    <TableCell className="tabular-nums">{amount(allocatableVal)}</TableCell>
                    <TableCell className="space-y-1 text-xs">
                      <div>
                        {doc.tools.map((t) => {
                          const ref = t.reference ? ` [${t.reference}]` : "";
                          return `${toolLabel[t.tool_kind] ?? t.tool_kind} (${amount(t.amount)})${ref}`;
                        }).join(" · ")}
                      </div>
                      {doc.allocations.map((a) => (
                        <div key={a.id} className="flex flex-wrap items-center gap-2 text-muted">
                          <span className="tabular-nums">
                            فاکتور {a.invoice_reference || invNames[a.invoice_id] || a.invoice_id}: {amount(a.amount)}
                          </span>
                          <Badge tone={a.reversed_at ? "neutral" : hasProof ? "success" : "warning"}>
                            {a.reversed_at
                              ? "برگشت‌شده"
                              : hasProof
                                ? "تخصیص دارای شاهد پرداخت"
                                : "تخصیص بدون شاهد پرداخت"}
                          </Badge>
                          {workspace.canWrite && !a.reversed_at && (
                            <Button
                              className="min-h-8 px-2 text-xs"
                              variant="ghost"
                              onClick={() => {
                                cmd.clearError();
                                setReverseReason("");
                                setReversingAlloc({
                                  allocation: a,
                                  documentId: doc.id,
                                  documentNumber: doc.number,
                                  documentVersion: doc.version,
                                });
                              }}
                            >
                              <ArrowCounterClockwiseIcon size={14} aria-hidden />
                              برگشت تخصیص
                            </Button>
                          )}
                        </div>
                      ))}
                      {(doc.operation_id || doc.journal_id) && (
                        <div className="flex flex-wrap gap-2 pt-0.5">
                          <ButtonLink variant="ghost" className="min-h-7 px-2 text-xs" href="/accounting">
                            مشاهده در اسناد حسابداری
                          </ButtonLink>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={doc.state === "posted" ? "success" : doc.state === "reversed" ? "danger" : "neutral"}>
                          {doc.state === "posted" ? "ثبت قطعی" : stateLabel[doc.state] ?? doc.state}
                        </Badge>
                        {doc.state === "draft" && (
                          <Badge tone={hasProof ? "neutral" : "warning"}>
                            {hasProof ? "دارای شاهد پرداخت" : "پیش‌نویس بدون شاهد پرداخت"}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {canAllocate && firstAvailableTool && (
                        <Button
                          className="min-h-8 px-3 text-xs"
                          variant="secondary"
                          onClick={() => {
                            cmd.clearError();
                            setSelectedToolId(firstAvailableTool.id);
                            setSelectedInvoiceId("");
                            setAllocAmount("");
                            setAllocDoc(doc);
                          }}
                        >
                          تخصیص به فاکتور
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )) : <TableEmptyCell colSpan={9} title="سند خزانه‌ای پیدا نشد" />}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
  );
}
