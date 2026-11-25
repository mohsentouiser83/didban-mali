"use client";
import { ReceiptIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
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
import { useCheques, chequeStateLabels, chequeDirectionLabels } from "@/hooks/use-cheques";
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div className="w-64">
                <Field id="cheque-filter-direction" label="گزارش نوع چک">
                  <Select
                    id="cheque-filter-direction"
                    value={c.directionFilter}
                    onValueChange={c.setDirectionFilter}
                    options={[
                      { value: "all", label: "همه چک‌ها" },
                      { value: "received", label: "دریافتنی" },
                      { value: "issued", label: "پرداختنی" },
                      { value: "guarantee_in", label: "تضمین دیگران نزد ما" },
                      { value: "guarantee_out", label: "تضمین ما نزد دیگران" },
                    ]}
                  />
                </Field>
              </div>
            </div>
            {c.importBusy && <LoadingState label="در حال ورود چک‌ها..." />}
            <Table
              title="فهرست و گزارش چک‌های صیادی"
              onImport={c.workspace.canWrite && !c.importBusy ? c.importFromExcel : undefined}
            >
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
                        {chequeDirectionLabels[cheque.direction] || cheque.direction}
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
                  <TableEmptyCell colSpan={7} title="هنوز چکی ثبت نشده است" />
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
