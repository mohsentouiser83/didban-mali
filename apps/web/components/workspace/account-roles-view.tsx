"use client";
import { BooksIcon } from "@phosphor-icons/react";
import { ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Field, FormMessage } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
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
import { LoadingState, ErrorState } from "@/components/ui/content-states";
import { useWorkspace } from "@/hooks/workspace";
import { useAccountRoles } from "@/hooks/use-account-roles";
import { PageHeader, Panel, NoCompany } from "./page-parts";
export function AccountRolesView() {
  const w = useWorkspace();
  return w.company ? (
    <Workspace key={`${w.user?.id}:${w.company.id}`} />
  ) : (
    <NoCompany />
  );
}
function Workspace() {
  const c = useAccountRoles();
  return (
    <>
      <PageHeader
        title="نقش حساب‌های دفتر اصلی"
        icon={BooksIcon}
        action={
          <ButtonLink href="/settings/accounts" variant="secondary">
            کدینگ حساب‌ها
          </ButtonLink>
        }
      />
      <Panel>
        {c.resource.loading ? (
          <LoadingState />
        ) : c.resource.error ? (
          <ErrorState
            message={c.resource.error.message}
            onRetry={c.resource.refresh}
          />
        ) : (
          <>
            <Field id="role-search" label="جستجوی حساب">
              <Input
                id="role-search"
                value={c.query}
                onChange={(event) => c.setQuery(event.target.value)}
              />
            </Field>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>کد</TableHead>
                  <TableHead>حساب</TableHead>
                  <TableHead>نقش مالی</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.rows.length ? (
                  c.rows.map((row) => (
                    <TableRow key={row.account_id}>
                      <TableRowHeader>
                        <span dir="ltr">{row.code}</span>
                      </TableRowHeader>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>
                        <Select
                          label={`نقش ${row.name}`}
                          value={row.role || "unassigned"}
                          onValueChange={(role) => c.save(row, role)}
                          options={c.options}
                          disabled={!c.editable || c.command.busy}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell colSpan={3} title="حسابی پیدا نشد" />
                )}
              </TableBody>
            </Table>
            <Pagination
              page={c.page - 1}
              total={c.total}
              onPrevious={() => c.setPage(c.page - 1)}
              onNext={() => c.setPage(c.page + 1)}
            />
            <FormMessage error>{c.command.error?.message}</FormMessage>
          </>
        )}
      </Panel>
    </>
  );
}
