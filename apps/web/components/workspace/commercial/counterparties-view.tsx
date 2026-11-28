"use client";
import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { useState } from "react";
import { UsersThreeIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Pagination } from "@/components/ui/pagination";
import { TableColumnSelect } from "@/components/ui/table-column-select";
import { Table, TableBody, TableCell, TableEmptyCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/ui/table";
import { useCounterparties } from "@/hooks/use-commercial";
import {
  counterpartyEntityKindLabel,
  counterpartyEntityKindOptions,
  counterpartyTypeLabel,
  type Counterparty,
} from "@/lib/commercial";
import { amount } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "../page-parts";
import { CounterpartyEditor } from "./counterparty-editor";
import { CounterpartyProfileDrawer } from "./counterparty-profile-drawer";

export function CounterpartiesView() {
  const view = useCounterparties();
  const [profileParty, setProfileParty] = useState<Counterparty | null>(null);

  if (!view.workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader
        title="طرف‌حساب‌ها"
        icon={UsersThreeIcon}
        action={
          view.canCreate && <Button onClick={() => view.open()}>طرف‌حساب جدید</Button>
        }
      />
      <Panel>
        {view.resource.loading ? <LoadingState /> : view.resource.error ? (
          <ErrorState message={view.resource.error.message} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead columnFilter={view.columnFilter("name")}>نام</TableHead>
                  <TableHead columnFilter={view.columnFilter("code")}>کد داخلی</TableHead>
                  <TableHead columnControl={
                    <TableColumnSelect columnTitle="نوع شخصیت" value={view.entityKindFilter}
                      onValueChange={view.changeEntityKindFilter}
                      options={[{ value: "all", label: "همه شخصیت‌ها" }, ...counterpartyEntityKindOptions]} />
                  }>نوع شخصیت</TableHead>
                  <TableHead columnControl={
                    <TableColumnSelect columnTitle="نقش‌های تجاری" value={view.typeFilter}
                      onValueChange={view.changeTypeFilter}
                      options={[
                        { value: "all", label: "همه نقش‌ها" },
                        { value: "customer", label: "مشتریان" },
                        { value: "supplier", label: "تأمین‌کنندگان" },
                        { value: "employee", label: "کارمندان" },
                        { value: "other", label: "سایر" },
                      ]} />
                  }>نقش‌های تجاری</TableHead>
                  <TableHead numeric>سقف اعتبار (ریال)</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.resource.data?.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableRowHeader>{row.name}</TableRowHeader>
                    <TableCell><bdi>{row.code}</bdi></TableCell>
                    <TableCell>
                      <Badge tone="neutral">{counterpartyEntityKindLabel(row.entity_kind)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {(row.roles?.length ? row.roles : [row.type]).map((r) => (
                          <Badge key={r} tone="primary">{counterpartyTypeLabel(r)}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell numeric>
                      {row.credit_limit_irr === null ? "—" : amount(row.credit_limit_irr)}
                    </TableCell>
                    <TableCell>
                      <Badge tone={row.active ? "success" : "neutral"}>
                        {row.active ? "فعال" : "غیرفعال"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <TableRowActions label={`عملیات ${row.name}`}>
                        <TableRowAction
                          aria-label={`مشاهده پرونده ${row.name}`}
                          onClick={() => setProfileParty(row)}
                          kind="view"
                        >
                          مشاهده پرونده
                        </TableRowAction>
                        {view.canEdit && (
                          <TableRowAction
                            aria-label={`ویرایش ${row.name}`}
                            onClick={() => view.open(row, false)}
                            kind="edit"
                          >
                            ویرایش
                          </TableRowAction>
                        )}
                      </TableRowActions>
                    </TableCell>
                  </TableRow>
                ))}
                {!view.resource.data?.items.length && (
                  <TableEmptyCell
                    colSpan={7}
                    title={
                      view.filtersActive
                        ? "طرف‌حسابی با این شرایط پیدا نشد"
                        : "طرف‌حسابی ثبت نشده است"
                    }
                  />
                )}
              </TableBody>
            </Table>
            <Pagination {...view.pagination} />
          </>
        )}
      </Panel>
      {profileParty && (
        <CounterpartyProfileDrawer
          party={profileParty}
          canEdit={view.canEdit}
          canViewReports={view.canViewReports}
          onEdit={() => {
            const target = profileParty;
            setProfileParty(null);
            view.open(target, false);
          }}
          onClose={() => setProfileParty(null)}
        />
      )}
      {view.editor && (
        <CounterpartyEditor
          row={view.editor.row}
          readOnly={view.editor.readOnly}
          busy={view.command.busy}
          error={view.command.error?.message}
          onClose={view.close}
          onSave={view.save}
        />
      )}
    </>
  );
}
