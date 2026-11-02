"use client";
import { BooksIcon, PlusIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Dialog } from "@/components/ui/dialog";
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
  const editable = !!view.capabilities.data?.can_manage_accounts;
  const error = view.resource.error || view.capabilities.error;
  return (
    <>
      <PageHeader
        title="کدینگ حساب‌ها"
        icon={BooksIcon}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/settings/account-roles" variant="secondary">
              نقش حساب‌ها
            </ButtonLink>
            <ButtonLink href="/accounting" variant="secondary">
              اسناد حسابداری
            </ButtonLink>
            {editable && (
              <Button onClick={() => view.open(null)}>
                <PlusIcon size={18} aria-hidden />
                حساب جدید
              </Button>
            )}
          </div>
        }
      />
      {editable && <ChartSetupPanel onImported={view.resource.refresh} />}
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
                        {editable && (
                          <Button
                            variant="secondary"
                            onClick={() => view.open(account)}
                          >
                            ویرایش
                          </Button>
                        )}
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
      <Dialog
        title={view.editing ? "ویرایش حساب" : "حساب جدید"}
        open={view.editing !== undefined}
        onOpenChange={(open) => {
          if (!open && !view.command.busy) view.close();
        }}
      >
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
              disabled={view.command.busy}
              onChange={(event) => view.change({ code: event.target.value })}
            />
          </Field>
          <Field id="ledger-name" name="name" label="نام حساب">
            <Input
              id="ledger-name"
              required
              maxLength={150}
              value={view.value.name}
              disabled={view.command.busy}
              onChange={(event) => view.change({ name: event.target.value })}
            />
          </Field>
          <Checkbox
            id="ledger-active"
            label="حساب فعال"
            checked={view.value.active}
            disabled={view.command.busy}
            onCheckedChange={(active) => view.change({ active })}
          />
          <FormMessage error>{view.command.error?.message}</FormMessage>
          <Button type="submit" busy={view.command.busy}>
            ذخیره حساب
          </Button>
        </Form>
      </Dialog>
    </>
  );
}
