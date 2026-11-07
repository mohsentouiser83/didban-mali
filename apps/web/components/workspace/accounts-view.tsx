"use client";
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { AccountRoleField } from "./account-role-field";
import { BooksIcon, PlusIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CursorPagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import { ChartSetupPanel } from "./chart-setup-panel";
import { useLedgerAccounts } from "@/hooks/use-accounting";
import { useWorkspace } from "@/hooks/workspace";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function AccountsView() {
  const workspace = useWorkspace();
  if (!workspace.company) return <NoCompany />;
  return <AccountsWorkspace key={workspace.company.id} />;
}
function AccountsWorkspace() {
  const view = useLedgerAccounts();
  const [method, setMethod] = useState("manual");
  const editable = !!view.capabilities.data?.can_manage_accounts;
  const error = view.resource.error || view.capabilities.error;
  return (
    <>
      <PageHeader
        title="کدینگ حساب‌ها"
        icon={BooksIcon}
        action={
          editable && (
            <Button
              onClick={() => {
                setMethod("manual");
                view.open(null);
              }}
            >
              <PlusIcon size={18} aria-hidden />
              حساب جدید
            </Button>
          )
        }
      />
      <Panel>
        {view.resource.loading || view.capabilities.loading ? (
          <LoadingState label="در حال دریافت حساب‌ها" variant="panels" />
        ) : error ? (
          <ErrorState
            message={error.message}
            onRetry={() => {
              view.resource.refresh();
              view.capabilities.refresh();
            }}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>کد حساب</TableHead>
                  <TableHead>نام حساب</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>
                    <span className="sr-only">عملیات</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rows.length ? (
                  view.rows.map((account) => (
                    <TableRow key={account.id}>
                      <TableRowHeader>
                        <span dir="ltr" className="inline-block font-mono">
                          {account.code}
                        </span>
                      </TableRowHeader>
                      <TableCell>{account.name}</TableCell>
                      <TableCell>
                        <Badge tone={account.active ? "success" : "neutral"}>
                          {account.active ? "فعال" : "غیرفعال"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {
                          <Button
                            variant="secondary"
                            onClick={() => view.open(account)}
                          >
                            {editable ? "ویرایش" : "مشاهده"}
                          </Button>
                        }
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell colSpan={4} title="حسابی تعریف نشده" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...view.resource} />
          </>
        )}
      </Panel>
      <Drawer
        title={view.editing ? "ویرایش حساب" : "حساب جدید"}
        open={view.editing !== undefined}
        onOpenChange={(open) => {
          if (!open && !view.command.busy) view.close();
        }}
      >
        {!view.editing && editable && (
          <Select
            label="روش افزودن حساب"
            value={method}
            onValueChange={setMethod}
            options={[
              { value: "manual", label: "تعریف دستی" },
              { value: "import", label: "استفاده از فایل یا الگوی حساب‌ها" },
            ]}
          />
        )}
        {method === "import" && !view.editing ? (
          <ChartSetupPanel
            embedded
            onImported={() => {
              view.close();
              view.resource.refresh();
            }}
          />
        ) : (
          <Form
            fieldErrors={view.command.error?.fields}
            onSubmit={(event) => {
              event.preventDefault();
              view.save();
            }}
          >
            <Field id="ledger-code" name="code" label="کد حساب">
              <Input
                id="ledger-code"
                required
                dir="ltr"
                maxLength={100}
                value={view.value.code}
                disabled={!editable || view.command.busy}
                onChange={(event) => view.change({ code: event.target.value })}
              />
            </Field>
            <Field id="ledger-name" name="name" label="نام حساب">
              <Input
                id="ledger-name"
                required
                maxLength={150}
                value={view.value.name}
                disabled={!editable || view.command.busy}
                onChange={(event) => view.change({ name: event.target.value })}
              />
            </Field>
            <Checkbox
              id="ledger-active"
              label="حساب فعال"
              checked={view.value.active}
              disabled={!editable || view.command.busy}
              onCheckedChange={(active) => view.change({ active })}
            />
            {view.editing && <AccountRoleField accountId={view.editing.id} />}
            <FormMessage error>{view.command.error?.message}</FormMessage>
            {editable && (
              <Button type="submit" busy={view.command.busy}>
                ذخیره حساب
              </Button>
            )}
          </Form>
        )}
      </Drawer>
    </>
  );
}
