"use client";
import { ReceiptIcon } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
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
import { useCheques, chequeStateLabels } from "@/hooks/use-cheques";
import { useWorkspace } from "@/hooks/workspace";
import { amount, displayDate } from "@/lib/utils";
import { PageHeader, Panel, NoCompany } from "./page-parts";
import { ChequeForm } from "./cheque-form";
import { ChequeEvents } from "./cheque-events";
function ChequeWorkspace() {
  const c = useCheques();
  return (
    <>
      <PageHeader
        title="چک‌ها"
        icon={ReceiptIcon}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/settlements" variant="secondary">
              دریافت و پرداخت
            </ButtonLink>
            {c.workspace.canWrite && (
              <Button onClick={c.showCreate}>ثبت چک</Button>
            )}
          </div>
        }
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>شماره</TableHead>
                  <TableHead>نوع</TableHead>
                  <TableHead>طرف حساب</TableHead>
                  <TableHead>سررسید</TableHead>
                  <TableHead>مبلغ (ریال)</TableHead>
                  <TableHead>وضعیت</TableHead>
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
                      <TableCell>
                        {cheque.direction === "received"
                          ? "دریافتی"
                          : "پرداختی"}
                      </TableCell>
                      <TableCell>{cheque.party_id}</TableCell>
                      <TableCell>{displayDate(cheque.due_date)}</TableCell>
                      <TableCell>{amount(cheque.amount)}</TableCell>
                      <TableCell>
                        <Badge tone="neutral">
                          {chequeStateLabels[cheque.state] || "نامشخص"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="secondary"
                          onClick={() => c.inspect(cheque)}
                        >
                          سابقه و رویداد
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell colSpan={7} title="چکی ثبت نشده" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...c.resource} />
          </>
        )}
      </Panel>
      <ChequeForm c={c} />
      <ChequeEvents c={c} />
    </>
  );
}
export function ChequesView() {
  const w = useWorkspace();
  if (!w.company) return <NoCompany />;
  return <ChequeWorkspace key={`${w.user?.id}:${w.company.id}`} />;
}
