"use client";

import {
  BarcodeIcon,
  PackageIcon,
  PencilSimpleIcon,
  PlusIcon,
  StorefrontIcon,
  TrashIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Switch } from "@/components/ui/switch";
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
  const addAction = view.canAdd && (
    <Button onClick={() => view.show()}>
      <PlusIcon size={18} aria-hidden />
      {addLabel}
    </Button>
  );
  return (
    <>
      <PageHeader
        title={isItem ? "کالاها" : "انبارها"}
        icon={isItem ? BarcodeIcon : StorefrontIcon}
        action={addAction}
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
            <Table
              title={isItem ? "فهرست کالاها" : "فهرست انبارها"}
              aria-label={isItem ? "فهرست کالاها" : "فهرست انبارها"}
              onImport={view.canAdd ? view.importFromExcel : undefined}
            >
              <TableHeader>
                <TableRow>
                  <TableHead>نام {singular}</TableHead>
                  <TableHead>کد</TableHead>
                  {isItem && <TableHead>واحد پایه</TableHead>}
                  {isItem && <TableHead>حساب موجودی</TableHead>}
                  <TableHead>وضعیت</TableHead>
                  {view.canManage && <TableHead>عملیات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rows.length ? view.rows.map(({ record: row, hasMovements }) => (
                  <TableRow key={row.id}>
                    <TableRowHeader>{row.name}</TableRowHeader>
                    <TableCell><bdi>{row.code}</bdi></TableCell>
                    {isItem && (
                      <TableCell>{"base_unit" in row && row.base_unit ? row.base_unit : "عدد"}</TableCell>
                    )}
                    {"inventory_account_id" in row && (
                      <TableCell>{view.accountNames.get(row.inventory_account_id) || "—"}</TableCell>
                    )}
                    <TableCell>
                      <Badge tone={row.active ? "success" : "neutral"}>{row.active ? "فعال" : "غیرفعال"}</Badge>
                    </TableCell>
                    {view.canManage && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" className="size-11 p-0" aria-label={`ویرایش ${row.name}`} onClick={() => view.show(row)}>
                            <PencilSimpleIcon size={18} aria-hidden />
                          </Button>
                          <Button variant="ghost" className="size-11 p-0 text-danger"
                            disabled={hasMovements}
                            aria-label={hasMovements ? `حذف ${row.name} به‌دلیل گردش انبار ممکن نیست` : `حذف ${row.name}`}
                            onClick={() => view.confirmRemove(row)}>
                            <TrashIcon size={18} aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )) : (
                  <TableEmptyCell
                    colSpan={3 + (isItem ? 2 : 0) + Number(view.canManage)}
                    title={isItem
                      ? view.inventory.data?.can_manage_catalog && !view.accounts.options.length
                        ? "برای تعریف کالا، حساب موجودی لازم است"
                        : "کالایی تعریف نشده"
                      : "انباری تعریف نشده"}
                  />
                )}
              </TableBody>
            </Table>
            <Pagination {...view.pagination} />
          </>
        )}
      </Panel>
      <Drawer
        title={view.editing ? `ویرایش ${singular}` : addLabel}
        open={view.open}
        onOpenChange={(open) => {
          if (!open) view.close();
        }}
        footer={
          <Button
            form="inventory-catalogue"
            type="submit"
            busy={view.command.busy}
            disabled={!view.value.name.trim()}
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
          
          <Field id="inventory-name" label={`نام ${singular}`} icon={isItem ? PackageIcon : StorefrontIcon}>
            <Input id="inventory-name" required maxLength={150} value={view.value.name}
              onChange={(event) => view.change({ name: event.target.value })} />
          </Field>
          {isItem && (
            <>
              <Field id="inventory-base-unit" name="base_unit" label="واحد پایه کالا" required>
                <Input id="inventory-base-unit" required maxLength={40} value={view.value.base_unit}
                  disabled={view.accountLocked}
                  onChange={(event) => view.change({ base_unit: event.target.value })} />
              </Field>
              <Field id="inventory-account" name="inventory_account_id" label="حساب موجودی (اختیاری)" icon={WalletIcon}>
                <Select id="inventory-account" label="حساب موجودی" value={view.value.inventory_account_id}
                  onValueChange={(inventory_account_id) => view.change({ inventory_account_id })}
                  options={view.accountOptions} disabled={view.accountLocked} />
              </Field>
            </>
          )}
          {view.editing && (
            <div className="flex items-center justify-between gap-3">
              <span>{singular} فعال</span>
              <Switch label={`${singular} فعال`} checked={view.value.active} onCheckedChange={(active) => view.change({ active })} />
            </div>
          )}
          <FormMessage error>{view.command.error?.message}</FormMessage>
        </Form>
      </Drawer>
      <ConfirmDialog
        open={!!view.deleting}
        onOpenChange={(open) => { if (!open) view.cancelRemove(); }}
        title={`حذف ${singular}`}
        busy={view.command.busy}
        onConfirm={view.remove}
      >
        <p>«{view.deleting?.name}» حذف شود؟</p>
        <FormMessage error>{view.command.error?.message}</FormMessage>
      </ConfirmDialog>
    </>
  );
}
