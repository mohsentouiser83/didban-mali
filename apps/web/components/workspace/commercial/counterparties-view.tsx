"use client";
import { UsersThreeIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableEmptyCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/ui/table";
import { useCounterparties } from "@/hooks/use-commercial";
import { amount } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "../page-parts";
import { CounterpartyEditor } from "./counterparty-editor";

export function CounterpartiesView() {
  const view = useCounterparties();
  if (!view.workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader title="طرف‌حساب‌ها" icon={UsersThreeIcon} action={
        view.canEdit && <Button onClick={() => view.open()}>طرف‌حساب جدید</Button>
      } />
      <Panel>
        <div className="mb-4 max-w-sm">
          <Field id="counterparty-search" label="جست‌وجوی نام یا کد">
            <Input id="counterparty-search" value={view.search} onChange={(event) => view.changeSearch(event.target.value)} />
          </Field>
        </div>
        {view.resource.loading ? <LoadingState /> : view.resource.error ? (
          <ErrorState message={view.resource.error.message} onRetry={view.resource.refresh} />
        ) : (
          <>
            <Table>
              <TableHeader><TableRow>
                <TableHead>نام</TableHead><TableHead>کد</TableHead>
                <TableHead numeric>سقف اعتبار (ریال)</TableHead><TableHead>وضعیت</TableHead><TableHead>پرونده</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {view.resource.data?.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableRowHeader>{row.name}</TableRowHeader>
                    <TableCell><bdi>{row.code}</bdi></TableCell>
                    <TableCell numeric>{row.credit_limit_irr === null ? "—" : amount(row.credit_limit_irr)}</TableCell>
                    <TableCell><Badge tone={row.active ? "success" : "neutral"}>{row.active ? "فعال" : "غیرفعال"}</Badge></TableCell>
                    <TableCell>
                      <Button variant="ghost" aria-label={`${view.canEdit ? "ویرایش" : "مشاهده"} ${row.name}`}
                        onClick={() => view.open(row, !view.canEdit)}>
                        {view.canEdit ? "ویرایش" : "مشاهده"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!view.resource.data?.items.length && (
                  <TableEmptyCell colSpan={5} title={view.search ? "طرف‌حسابی با این عبارت پیدا نشد" : "طرف‌حسابی ثبت نشده است"} />
                )}
              </TableBody>
            </Table>
            <Pagination {...view.pagination} />
          </>
        )}
      </Panel>
      {view.editor && <CounterpartyEditor row={view.editor.row} readOnly={view.editor.readOnly}
        busy={view.command.busy} error={view.command.error?.message} onClose={view.close} onSave={view.save} />}
    </>
  );
}
