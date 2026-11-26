import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Pagination } from "@/components/ui/pagination";
import { Field } from "@/components/ui/field";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
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
import { useInventoryCardex, type InventoryCardexScope } from "@/hooks/use-inventory-cardex";
import type { useInventoryOverview } from "@/hooks/use-inventory";
import { hasInventoryInvoice, inventoryInvoicePath, inventoryTitle } from "@/lib/inventory";
import { amount, displayDate, persian } from "@/lib/utils";
import { Panel } from "./page-parts";

type InventoryOverview = ReturnType<typeof useInventoryOverview>;

export function InventoryBalanceTable({
  view,
  onViewKardex,
  filters,
}: {
  view: InventoryOverview;
  onViewKardex?: (itemId?: string, warehouseId?: string) => void;
  filters?: React.ReactNode;
}) {
  return (
    <Panel
      title="موجودی و کاردکس کالا"
      action={
        onViewKardex && (
          <Button
            variant="ghost"
            onClick={() => onViewKardex()}
            className="min-h-8 gap-1.5 px-2.5 py-1 text-xs text-muted hover:text-foreground"
          >
            <ClockCounterClockwiseIcon size={15} />
            گردش کل کالاها
          </Button>
        )
      }
    >
      {filters}
      <Table aria-label="موجودی ثبت‌شده کالاها" title="موجودی ثبت‌شده کالاها">
        <TableHeader>
          <TableRow>
            <TableHead>کالا</TableHead>
            <TableHead>انبار</TableHead>
            <TableHead>تعداد موجودی</TableHead>
            <TableHead>ارزش موجودی (ریال)</TableHead>
            <TableHead>عملیات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.balances.length ? (
            view.balances.map((row) => (
              <TableRow key={`${row.item_id}:${row.warehouse_id}`}>
                <TableRowHeader>
                  {view.itemNames.get(row.item_id) || "—"}
                </TableRowHeader>
                <TableCell>
                  {view.warehouseNames.get(row.warehouse_id) || "—"}
                </TableCell>
                <TableCell className="font-medium">
                  {persian(row.quantity)} {view.itemUnits.get(row.item_id)}
                </TableCell>
                <TableCell className="whitespace-nowrap font-medium">
                  {amount(row.value_irr)}
                </TableCell>
                <TableCell>
                  {onViewKardex && (
                    <Button
                      variant="secondary"
                      className="min-h-8 gap-1.5 px-2.5 py-1 text-xs"
                      onClick={() =>
                        onViewKardex(row.item_id, row.warehouse_id)
                      }
                    >
                      <ClockCounterClockwiseIcon size={14} />
                      کاردکس
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyCell
              colSpan={5}
              title="موجودی ثبت‌شده‌ای در این دامنه نیست"
            />
          )}
        </TableBody>
      </Table>
      <Pagination {...view.balancePagination} />
    </Panel>
  );
}

export function InventoryKardexDrawer({ view, target, onClose }: {
  view: InventoryOverview;
  target: InventoryCardexScope;
  onClose: () => void;
}) {
  const cardex = useInventoryCardex(target);
  const itemName = target.itemId ? view.itemNames.get(target.itemId) : undefined;
  const warehouseName = target.warehouseId ? view.warehouseNames.get(target.warehouseId) : undefined;

  return (
    <Drawer
      title={itemName ? `کاردکس کالا: ${itemName}` : "گردش کالاهای انبار"}
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      className="sm:max-w-4xl"
    >
      <div className="space-y-4">
        {warehouseName && <span className="text-sm text-muted">{warehouseName}</span>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="cardex-from" label="از تاریخ">
            <PersianDatePicker id="cardex-from" value={cardex.fromDate} onChange={cardex.changeFrom} />
          </Field>
          <Field id="cardex-to" label="تا تاریخ" error={cardex.invalidRange ? "پایان بازه نباید پیش از شروع باشد." : undefined}>
            <PersianDatePicker id="cardex-to" value={cardex.toDate} onChange={cardex.changeTo} />
          </Field>
        </div>
        {cardex.resource.loading ? (
          <LoadingState label="در حال دریافت کاردکس" variant="table" />
        ) : cardex.resource.error ? (
          <ErrorState message={cardex.resource.error.message} onRetry={cardex.resource.refresh} />
        ) : cardex.resource.data && (
          <>
            <Table aria-label="گردش کالا" title={itemName ? `کاردکس: ${itemName}` : "گردش کالا"}>
              <TableHeader>
                <TableRow>
                  <TableHead>نوع گردش</TableHead>
                  <TableHead>تاریخ</TableHead>
                  {!target.itemId && <TableHead>کالا</TableHead>}
                  {!target.warehouseId && <TableHead>انبار</TableHead>}
                  <TableHead numeric>ورود</TableHead>
                  <TableHead numeric>خروج</TableHead>
                  <TableHead numeric>ارزش گردش (ریال)</TableHead>
                  {target.itemId && <TableHead numeric>مانده تعداد</TableHead>}
                  <TableHead>مرجع و عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cardex.resource.data.rows.length ? cardex.resource.data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableRowHeader>{inventoryTitle[row.kind]}</TableRowHeader>
                    <TableCell className="whitespace-nowrap">{displayDate(row.date)}</TableCell>
                    {!target.itemId && <TableCell>{row.item_name}</TableCell>}
                    {!target.warehouseId && <TableCell>{row.warehouse_name}</TableCell>}
                    <TableCell numeric>{row.in_quantity ? `${persian(row.in_quantity)} ${view.itemUnits.get(row.item_id) ?? ""}` : "—"}</TableCell>
                    <TableCell numeric>{row.out_quantity ? `${persian(row.out_quantity)} ${view.itemUnits.get(row.item_id) ?? ""}` : "—"}</TableCell>
                    <TableCell numeric>{amount(row.in_quantity ? row.in_value_irr : row.out_value_irr)}</TableCell>
                    {target.itemId && <TableCell numeric>{persian(row.balance_quantity)}</TableCell>}
                    <TableCell>
                      {row.source_reference && <bdi className="mb-1 block text-xs">{row.source_reference}</bdi>}
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" className="min-h-8 px-2.5 py-1 text-xs"
                          onClick={() => view.journal.select(row.journal_id)}>سند نهایی</Button>
                        {hasInventoryInvoice(row.kind) && (
                          <ButtonLink variant="ghost" className="min-h-8 px-2.5 py-1 text-xs"
                            href={inventoryInvoicePath(row.kind, row.operation_id)}>فاکتور</ButtonLink>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableEmptyCell colSpan={6 + Number(!target.itemId) + Number(!target.warehouseId) + Number(!!target.itemId)}
                    title="گردشی در این بازه ثبت نشده است" />
                )}
              </TableBody>
            </Table>
            <Pagination {...cardex.pagination} />
          </>
        )}
      </div>
    </Drawer>
  );
}

export function InventoryMovementTable({
  view,
}: {
  view: InventoryOverview;
}) {
  return (
    <Panel title="گردش نهایی کالا">
      {view.inventory.data?.movements_truncated && (
        <div className="mb-4">
          <StatusMessage tone="primary">
            فهرست به ۱۰۰ گردش آخر شرکت محدود است.
          </StatusMessage>
        </div>
      )}
      <Table aria-label="گردش نهایی کالا" title="گردش نهایی کالا">
        <TableHeader>
          <TableRow>
            <TableHead>گردش</TableHead>
            <TableHead>تاریخ</TableHead>
            <TableHead>کالا و انبار</TableHead>
            <TableHead>تغییر تعداد</TableHead>
            <TableHead>تغییر ارزش (ریال)</TableHead>
            <TableHead>عملیات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.movements.length ? (
            view.movements.map((row) => (
              <TableRow key={row.id}>
                <TableRowHeader>{inventoryTitle[row.kind]}</TableRowHeader>
                <TableCell className="whitespace-nowrap">
                  {displayDate(row.date)}
                </TableCell>
                <TableCell>
                  {view.itemNames.get(row.item_id) || "—"}
                  <span className="block text-xs text-muted">
                    {view.warehouseNames.get(row.warehouse_id) || "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <bdi>
                    {row.quantity > 0 ? "+" : ""}
                    {persian(row.quantity)}
                  </bdi>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <bdi>{amount(row.value_irr)}</bdi>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => view.journal.select(row.journal_id)}
                    >
                      سند نهایی
                    </Button>
                    {hasInventoryInvoice(row.kind) && (
                      <ButtonLink
                        variant="ghost"
                        href={inventoryInvoicePath(
                          row.kind,
                          row.operation_id,
                        )}
                      >
                        فاکتور و تسویه
                      </ButtonLink>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyCell
              colSpan={6}
              title="گردش نهایی در این دامنه ثبت نشده"
            />
          )}
        </TableBody>
      </Table>
      <Pagination {...view.movementPagination} />
    </Panel>
  );
}
