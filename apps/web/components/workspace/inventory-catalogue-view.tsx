"use client";

import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import {
  BarcodeIcon,
  PackageIcon,
  PencilSimpleIcon,
  PlusIcon,
  StorefrontIcon,
  TrashIcon,
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
import { persian } from "@/lib/utils";
import type { InventoryCatalogue, InventoryItemKind } from "@/lib/inventory";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { ItemWarehousesDialog } from "./item-warehouses-dialog";

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
  const addLabel = isItem ? "افزودن کالا یا خدمت" : "افزودن انبار";
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
        {view.inventory.loading || view.units.loading ? (
          <LoadingState variant="panels" />
        ) : view.inventory.error || view.units.error ? (
          <ErrorState
            message={(view.inventory.error ?? view.units.error)?.message}
            onRetry={() => {
              view.inventory.refresh();
              if (isItem) view.units.refresh();
            }}
          />
        ) : (
          <>
            <Table
              title={isItem ? "فهرست کالاها" : "فهرست انبارها"}
              aria-label={isItem ? "فهرست کالاها" : "فهرست انبارها"}
              onImport={view.canAdd ? view.previewImport : undefined}
            >
              <TableHeader>
                <TableRow>
                  <TableHead>نام {singular}</TableHead>
                  <TableHead>کد</TableHead>
                  {isItem && <><TableHead>نوع</TableHead><TableHead>واحد پایه</TableHead></>}
                  <TableHead>وضعیت</TableHead>
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rows.length ? view.rows.map(({ record: row, hasMovements }) => (
                  <TableRow key={row.id}>
                    <TableRowHeader>{row.name}</TableRowHeader>
                    <TableCell><bdi>{row.code}</bdi></TableCell>
                    {isItem && (
                      <>
                        <TableCell>{"item_kind" in row && row.item_kind === "service" ? "خدمت" : "کالا"}</TableCell>
                        <TableCell>{"base_unit" in row && row.base_unit ? row.base_unit : "عدد"}</TableCell>
                      </>
                    )}
                    <TableCell>
                      <Badge tone={row.active ? "success" : "neutral"}>{row.active ? "فعال" : "غیرفعال"}</Badge>
                    </TableCell>
                    <TableCell>
                      <TableRowActions label={`عملیات ${row.name}`}>
                        {!isItem && (
                          <TableRowAction
                            href={`/accounting/inventory?warehouse_id=${encodeURIComponent(row.id)}`}
                            kind="view"
                          >
                            مشاهده موجودی
                          </TableRowAction>
                        )}
                        {isItem && "inventory_account_id" in row && row.item_kind !== "service" && (
                          <TableRowAction
                            onClick={() => view.itemWarehouses.show(row)}
                          >
                            {view.canManage && row.active ? "اتصال به انبار" : "انبارهای کالا"}
                          </TableRowAction>
                        )}
                        {view.canManage && (
                          <>
                            <TableRowAction
                              aria-label={`ویرایش ${row.name}`}
                              onClick={() => view.show(row)}
                              icon={<PencilSimpleIcon size={18} aria-hidden />}
                            >
                              ویرایش
                            </TableRowAction>
                            <TableRowAction
                              disabled={hasMovements}
                              aria-label={hasMovements ? `حذف ${row.name} به‌دلیل گردش انبار ممکن نیست` : `حذف ${row.name}`}
                              onClick={() => view.confirmRemove(row)}
                              icon={<TrashIcon size={18} aria-hidden />}
                              danger
                            >
                              {hasMovements ? "غیرقابل حذف (دارای گردش)" : "حذف"}
                            </TableRowAction>
                          </>
                        )}
                      </TableRowActions>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableEmptyCell
                    colSpan={isItem ? 6 : 4}
                    title={isItem ? "کالایی تعریف نشده" : "انباری تعریف نشده"}
                  />
                )}
              </TableBody>
            </Table>
            <Pagination {...view.pagination} />
          </>
        )}
      </Panel>
      {isItem && <ItemWarehousesDialog view={view.itemWarehouses} />}
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
            disabled={!view.canSave}
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
              <Field id="inventory-kind" name="item_kind" label="نوع قلم" required>
                <Select id="inventory-kind" value={view.value.item_kind} disabled={view.itemFieldsLocked}
                  options={[{ value: "goods", label: "کالا" }, { value: "service", label: "خدمت" }]}
                  onValueChange={(item_kind) => view.change({ item_kind: item_kind as InventoryItemKind })} />
              </Field>
              <Field id="inventory-base-unit" name="base_unit" label="واحد پایه" required>
                <Select id="inventory-base-unit" options={view.unitOptions} value={view.value.base_unit}
                  disabled={view.itemFieldsLocked}
                  onValueChange={(base_unit) => view.change({ base_unit })} />
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
      <Drawer
        open={view.importRows !== null}
        onOpenChange={(open) => { if (!open) view.closeImport(); }}
        title="پیش‌نمایش ورود اکسل"
        footer={<Button className="w-full" disabled={!view.importRows?.length || view.importRows.some((row) => !!row.error)}
          busy={view.importBusy} onClick={() => void view.confirmImport()}>ثبت ردیف‌ها</Button>}
      >
        <Table>
          <TableHeader><TableRow><TableHead>ردیف</TableHead><TableHead>نام</TableHead><TableHead>نتیجه بررسی</TableHead></TableRow></TableHeader>
          <TableBody>{view.importRows?.map((row) => (
            <TableRow key={row.row}><TableRowHeader>{persian(row.row)}</TableRowHeader>
              <TableCell>{row.name || "—"}</TableCell><TableCell>{row.error || "آماده ثبت"}</TableCell></TableRow>
          ))}</TableBody>
        </Table>
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
