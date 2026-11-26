"use client";
import { useState } from "react";
import { FilesIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableEmptyCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/ui/table";
import { tehranToday } from "@/lib/native-invoices";
import { useWorkspace } from "@/hooks/workspace";
import { useProformas } from "@/hooks/use-commercial";
import type { Proforma } from "@/lib/commercial";
import { amount, displayDate, persian } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "../page-parts";
import { ProformaConversion } from "./proforma-conversion";
import { ProformaEditor } from "./proforma-editor";

const statuses: Record<string, string> = {
  draft: "پیش‌نویس",
  issued: "صادرشده",
  conversion_pending: "در انتظار ثبت سند",
  converted: "تبدیل‌شده",
  expired: "منقضی",
  cancelled: "لغوشده",
};
const units = { IRR: "ریال", TOMAN: "تومان" };

export function ProformasView() {
  const { company, user } = useWorkspace();
  if (!company) return <NoCompany />;
  return <ProformasWorkspace key={`${user?.id}:${company.id}`} />;
}

function ProformasWorkspace() {
  const view = useProformas();
  const [conversion, setConversion] = useState<Proforma>();
  const [converted, setConverted] = useState(false);
  return (
    <>
      <PageHeader title="پیش‌فاکتورها" icon={FilesIcon} action={
        view.canPrepare && <Button onClick={() => view.open()}>پیش‌فاکتور جدید</Button>
      } />
      {converted && (
        <Panel>
          <ButtonLink href="/accounting" variant="secondary">مشاهدهٔ پیش‌نویس در اسناد</ButtonLink>
        </Panel>
      )}
      <Panel>
        {view.resource.loading ? <LoadingState /> : view.resource.error ? (
          <ErrorState message={view.resource.error.message} onRetry={view.resource.refresh} />
        ) : (
          <>
            <Table>
              <TableHeader><TableRow>
                <TableHead>شماره</TableHead><TableHead>مشتری</TableHead>
                <TableHead>تاریخ صدور</TableHead><TableHead>اعتبار تا</TableHead>
                <TableHead numeric>مبلغ</TableHead><TableHead>وضعیت</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {view.resource.data?.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableRowHeader><bdi>{row.number}</bdi></TableRowHeader>
                    <TableCell>
                      <span>{row.party_name ? `${row.party_name} (${row.party_code || row.party_id})` : <bdi>{row.party_id}</bdi>}</span>
                      {row.direction === "purchase" && (
                        <Badge tone="neutral" className="ms-1.5 text-[11px]">خرید (تاریخی)</Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{displayDate(row.date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.expiry_date ? displayDate(row.expiry_date) : "—"}</TableCell>
                    <TableCell numeric className="whitespace-nowrap">{amount(row.total_amount)} {units[row.currency]}</TableCell>
                    <TableCell>
                      <Badge tone={row.status === "converted" ? "success" : row.status === "conversion_pending" ? "primary" : row.status === "cancelled" ? "neutral" : "warning"}>
                        {statuses[row.status] ?? row.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button variant="ghost" aria-label={`مشاهده پیش‌فاکتور ${row.number}`}
                          onClick={() => view.open(row, true)}>مشاهده</Button>
                        {view.base && (
                          <ButtonLink href={`/api/v1${view.base}/${row.id}/export`} download variant="ghost">
                            خروجی PDF
                          </ButtonLink>
                        )}
                        {view.canPrepare && row.direction === "sale" && ["draft", "issued"].includes(row.status) &&
                          <Button variant="ghost" aria-label={`ویرایش پیش‌فاکتور ${row.number}`}
                            onClick={() => view.open(row)}>ویرایش</Button>}
                        {view.canPrepare && view.capabilities.data?.posting_available &&
                          row.direction === "sale" && row.status === "issued" &&
                          (!row.expiry_date || row.expiry_date >= tehranToday()) && (
                            <Button variant="ghost" onClick={() => setConversion(row)}>تبدیل به پیش‌نویس فروش</Button>
                          )}
                        {row.status === "conversion_pending" && row.converted_draft_id && (
                          <ButtonLink variant="soft" href={`/accounting?review_draft=${encodeURIComponent(row.converted_draft_id)}`}>
                            پیش‌نویس در اسناد
                          </ButtonLink>
                        )}
                        {row.status === "converted" && (
                          <ButtonLink variant="soft" href={`/receivables${row.converted_operation_id ? `?operation=${encodeURIComponent(row.converted_operation_id)}` : ""}`}>
                            {row.converted_document_number ? `فاکتور ${row.converted_document_number}` : "فاکتور فروش"}
                          </ButtonLink>
                        )}
                        {view.canPrepare && ["draft", "issued"].includes(row.status) && (
                          <Button variant="ghost" onClick={() => view.cancel(row, "لغو از کارپوشه پیش‌فاکتور")}>لغو</Button>
                        )}

                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!view.resource.data?.items.length && (
                  <TableEmptyCell colSpan={7} title="پیش‌فاکتوری ثبت نشده است" />
                )}
              </TableBody>
            </Table>
            <Pagination {...view.pagination} />
          </>
        )}
      </Panel>
      {conversion && (
        <ProformaConversion key={conversion.id} row={conversion} onClose={() => setConversion(undefined)}
          onComplete={() => {
            setConversion(undefined);
            setConverted(true);
            view.resource.refresh();
          }} />
      )}
      {view.editor && (view.editor.readOnly && view.editor.row && view.base ? (
        <ProformaDetail row={view.editor.row} exportHref={`/api/v1${view.base}/${view.editor.row.id}/export`}
          onClose={view.close} />
      ) : (
        <ProformaEditor row={view.editor.row} busy={view.command.busy} error={view.command.error?.message}
          partyQuery={view.partyQuery} partyOptions={view.partyOptions} partyError={view.partyError} itemOptions={view.itemOptions}
          canManageParties={view.canManageAccounts}
          onPartyCreated={() => view.refreshParties()}
          onPartySearch={view.setPartyQuery} onClose={view.close} onSave={view.save} />
      ))}
    </>
  );
}

function ProformaDetail({ row, exportHref, onClose }: {
  row: Proforma; exportHref: string; onClose: () => void;
}) {
  return (
    <Drawer open onOpenChange={onClose} className="max-w-3xl"
      title={`پیش‌فاکتور ${row.number}`}
      footer={<ButtonLink href={exportHref} download variant="secondary">دریافت PDF</ButtonLink>}>
      <div className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-muted">طرف‌حساب</dt><dd><bdi>{row.party_id}</bdi></dd></div>
          <div><dt className="text-muted">تاریخ صدور</dt><dd>{displayDate(row.date)}</dd></div>
          <div><dt className="text-muted">اعتبار تا</dt><dd>{row.expiry_date ? displayDate(row.expiry_date) : "—"}</dd></div>
          <div><dt className="text-muted">مبلغ کل</dt><dd>{amount(row.total_amount)} {units[row.currency]}</dd></div>
        </dl>
        <Table>
          <TableHeader><TableRow><TableHead>شرح</TableHead><TableHead numeric>تعداد</TableHead>
            <TableHead numeric>بهای واحد</TableHead><TableHead numeric>تخفیف</TableHead>
            <TableHead numeric>مبلغ ردیف</TableHead></TableRow></TableHeader>
          <TableBody>{row.lines.map((line) => (
            <TableRow key={line.line_id}>
              <TableRowHeader>{line.description}</TableRowHeader><TableCell numeric>{persian(line.quantity)}</TableCell>
              <TableCell numeric>{amount(line.unit_price)}</TableCell><TableCell numeric>{amount(line.discount)}</TableCell>
              <TableCell numeric>{amount(line.total)}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
        {row.terms && <p className="whitespace-pre-wrap">{row.terms}</p>}
      </div>
    </Drawer>
  );
}
