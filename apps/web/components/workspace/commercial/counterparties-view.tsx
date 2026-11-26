"use client";
import { useState } from "react";
import { UsersThreeIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
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
          view.canEdit && <Button onClick={() => view.open()}>طرف‌حساب جدید</Button>
        }
      />
      <Panel>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-60 max-w-sm flex-1">
            <Field id="counterparty-search" label="جست‌وجوی نام یا کد">
              <Input
                id="counterparty-search"
                value={view.search}
                onChange={(event) => view.changeSearch(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44">
              <Field id="counterparty-entity-filter" label="نوع شخصیت">
                <Select
                  id="counterparty-entity-filter"
                  value={view.entityKindFilter}
                  onValueChange={view.changeEntityKindFilter}
                  options={[
                    { value: "all", label: "همه شخصیت‌ها" },
                    ...counterpartyEntityKindOptions.map((o) => ({ value: o.value, label: o.label })),
                  ]}
                />
              </Field>
            </div>
            <div className="w-48">
              <Field id="counterparty-role-filter" label="نقش تجاری">
                <Select
                  id="counterparty-role-filter"
                  value={view.typeFilter}
                  onValueChange={view.changeTypeFilter}
                  options={[
                    { value: "all", label: "همه نقش‌ها" },
                    { value: "customer", label: "مشتریان" },
                    { value: "supplier", label: "تأمین‌کنندگان" },
                    { value: "employee", label: "کارمندان" },
                    { value: "other", label: "سایر" },
                  ]}
                />
              </Field>
            </div>
          </div>
        </div>
        {view.resource.loading ? <LoadingState /> : view.resource.error ? (
          <ErrorState message={view.resource.error.message} onRetry={view.resource.refresh} />
        ) : (
          <>
            <Table showSearch={false}>
              <TableHeader>
                <TableRow>
                  <TableHead>نام</TableHead>
                  <TableHead>کد داخلی</TableHead>
                  <TableHead>نوع شخصیت</TableHead>
                  <TableHead>نقش‌های تجاری</TableHead>
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
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          variant="ghost"
                          aria-label={`مشاهده پرونده ${row.name}`}
                          onClick={() => setProfileParty(row)}
                        >
                          مشاهده پرونده
                        </Button>
                        {view.canEdit && (
                          <Button
                            variant="ghost"
                            aria-label={`ویرایش ${row.name}`}
                            onClick={() => view.open(row, false)}
                          >
                            ویرایش
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!view.resource.data?.items.length && (
                  <TableEmptyCell
                    colSpan={7}
                    title={
                      view.search || view.typeFilter !== "all" || view.entityKindFilter !== "all"
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
