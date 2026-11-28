"use client";
import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { ReceiptIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState, ErrorState } from "@/components/ui/content-states";
import { CursorPagination } from "@/components/ui/pagination";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
  TableEmptyCell,
} from "@/components/ui/table";
import { useCheques, chequeStateLabels, chequeDirectionLabels, chequeSayadStatusLabels } from "@/hooks/use-cheques";
import { useWorkspace } from "@/hooks/workspace";
import { amount, displayDate } from "@/lib/utils";
import { PageHeader, Panel, NoCompany } from "./page-parts";
import { ChequeForm } from "./cheque-form";
import { ChequeImportPreview } from "./cheque-import-preview";
import { ChequeEvents } from "./cheque-events";
function ChequeWorkspace() {
  const c = useCheques();
  return (
    <>
      <PageHeader
        title="چک‌های صیادی"
        icon={ReceiptIcon}
        action={c.workspace.canWrite && (
          <Button onClick={c.showCreate}>ثبت چک جدید</Button>
        )}
      />
      <Panel>
        {c.resource.loading ? (
          <LoadingState label="در حال دریافت چک‌ها" />
        ) : c.resource.error ? (
          <ErrorState
            message={c.resource.error.message}
            onRetry={c.resource.refresh}
          />
        ) : (
          <>
            {c.importBusy && <LoadingState label="در حال ورود چک‌ها..." />}
            <Table
              title="فهرست و گزارش چک‌های صیادی"
              onImport={c.workspace.canWrite && !c.importBusy ? c.previewImport : undefined}
            >
              <TableHeader>
                <TableRow>
                  <TableHead>شماره برگه</TableHead>
                  <TableHead>شناسهٔ صیادی</TableHead>
                  <TableHead>نوع</TableHead>
                  <TableHead>طرف حساب</TableHead>
                  <TableHead>سررسید</TableHead>
                  <TableHead>مبلغ (ریال)</TableHead>
                  <TableHead>وضعیت چک</TableHead>
                  <TableHead>وضعیت صیاد</TableHead>
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.resource.data?.items.length ? (
                  c.resource.data.items.map((cheque) => (
                    <TableRow key={cheque.id}>
                      <TableRowHeader>
                        <span dir="ltr">{cheque.number}</span>
                      </TableRowHeader>
                      <TableCell><bdi>{cheque.sayad_id || "—"}</bdi></TableCell>
                      <TableCell>
                        {chequeDirectionLabels[cheque.direction] || cheque.direction}
                      </TableCell>
                      <TableCell>
                        {c.counterpartyNames[cheque.counterparty_id || cheque.party_id] || cheque.party_id}
                      </TableCell>
                      <TableCell>{displayDate(cheque.due_date)}</TableCell>
                      <TableCell className="tabular-nums">{amount(cheque.amount)}</TableCell>
                      <TableCell>
                        <Badge tone="neutral">
                          {chequeStateLabels[cheque.state] || "نامشخص"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {cheque.sayad_id
                          ? chequeSayadStatusLabels[cheque.sayad_status || "not_verified"] || "نامشخص"
                          : "شناسه ثبت نشده"}
                      </TableCell>
                      <TableCell>
                        <TableRowActions label={`عملیات ${cheque.number}`}>
                          <TableRowAction onClick={() => c.inspect(cheque)} kind="view">سابقه و رویداد</TableRowAction>
                        </TableRowActions>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell colSpan={9} title="هنوز چکی ثبت نشده است" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...c.resource} />
          </>
        )}
      </Panel>
      <ChequeForm c={c} />
      <ChequeEvents c={c} />
      <ChequeImportPreview c={c} />
    </>
  );
}
export function ChequesView() {
  const w = useWorkspace();
  if (!w.company) return <NoCompany />;
  return <ChequeWorkspace key={`${w.user?.id}:${w.company.id}`} />;
}
