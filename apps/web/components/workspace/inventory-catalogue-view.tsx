"use client";

import {
  BarcodeIcon,
  PackageIcon,
  PlusIcon,
  StorefrontIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
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
import { useInventoryCatalogue } from "@/hooks/use-inventory";
import { useWorkspace } from "@/hooks/workspace";
import type { InventoryCatalogue } from "@/lib/inventory";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function InventoryCatalogueView({ entity }: { entity: InventoryCatalogue }) {
  const workspace = useWorkspace();
  return workspace.company ? (
    <Catalogue key={`${workspace.user?.id}:${workspace.company.id}:${entity}`} entity={entity} />
  ) : <NoCompany />;
}

function Catalogue({ entity }: { entity: InventoryCatalogue }) {
  const view = useInventoryCatalogue(entity);
  const isItem = entity === "items";
  const singular = isItem ? "کالا" : "انبار";
  const addLabel = isItem ? "افزودن کالا" : "افزودن انبار";
  const canAdd = !!view.inventory.data?.can_manage_catalog &&
    (!isItem || (!view.accounts.loading && !view.accounts.error && view.accounts.options.length > 0));
  const addAction = canAdd && (
    <Button onClick={view.show}>
      <PlusIcon size={18} aria-hidden />
      {addLabel}
    </Button>
  );
  const accountNames = new Map(view.accounts.items.map((account) => [account.id, `${account.code} · ${account.name}`]));
  return (
    <>
      <PageHeader
        title={isItem ? "کالاها" : "انبارها"}
        icon={isItem ? PackageIcon : StorefrontIcon}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/accounting/inventory" variant="secondary">موجودی و گردش کالا</ButtonLink>
            {addAction}
          </div>
        }
      />
      <Panel>
        {view.inventory.loading || (isItem && view.accounts.loading) ? (
          <LoadingState variant="panels" />
        ) : view.inventory.error || (isItem && view.accounts.error) ? (
          <ErrorState
            message={(view.inventory.error ?? view.accounts.error)?.message}
            onRetry={() => {
              view.inventory.refresh();
              if (isItem) view.accounts.refresh();
            }}
          />
        ) : (
          <>
            <Table aria-label={isItem ? "فهرست کالاها" : "فهرست انبارها"}>
              <TableHeader>
                <TableRow>
                  <TableHead>نام {singular}</TableHead>
                  <TableHead>کد</TableHead>
                  {isItem && <TableHead>حساب موجودی</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rows.length ? view.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableRowHeader>{row.name}</TableRowHeader>
                    <TableCell><bdi>{row.code}</bdi></TableCell>
                    {"inventory_account_id" in row && (
                      <TableCell>{accountNames.get(row.inventory_account_id) || "—"}</TableCell>
                    )}
                  </TableRow>
                )) : (
                  <TableEmptyCell
                    colSpan={isItem ? 3 : 2}
                    title={isItem ? "کالایی تعریف نشده" : "انباری تعریف نشده"}
                    action={isItem && view.inventory.data?.can_manage_catalog && !view.accounts.options.length ? (
                      <ButtonLink href="/settings/accounts">تعریف حساب موجودی</ButtonLink>
                    ) : undefined}
                  />
                )}
              </TableBody>
            </Table>
            <Pagination {...view.pagination} />
          </>
        )}
      </Panel>
      <Drawer
        title={addLabel}
        open={view.open}
        onOpenChange={(open) => {
          if (!open) view.close();
        }}
        footer={
          <Button
            form="inventory-catalogue"
            type="submit"
            busy={view.command.busy}
            disabled={isItem && !view.value.inventory_account_id}
          >
            ذخیره
          </Button>
        }
      >
        <Form
          id="inventory-catalogue"
          fieldErrors={view.command.error?.fields}
          onSubmit={(event) => {
            event.preventDefault();
            view.save();
          }}
        >
          <Field id="inventory-code" label={`کد ${singular}`} icon={BarcodeIcon}>
            <Input id="inventory-code" required maxLength={100} value={view.value.code}
              onChange={(event) => view.change({ code: event.target.value })} />
          </Field>
          <Field id="inventory-name" label={`نام ${singular}`} icon={isItem ? PackageIcon : StorefrontIcon}>
            <Input id="inventory-name" required maxLength={150} value={view.value.name}
              onChange={(event) => view.change({ name: event.target.value })} />
          </Field>
          {isItem && (
            <Field id="inventory-account" name="inventory_account_id" label="حساب موجودی" icon={WalletIcon}>
              <Select id="inventory-account" label="حساب موجودی" value={view.value.inventory_account_id}
                onValueChange={(inventory_account_id) => view.change({ inventory_account_id })}
                options={view.accounts.options} />
            </Field>
          )}
          <FormMessage error>{view.command.error?.message}</FormMessage>
        </Form>
      </Drawer>
    </>
  );
}
