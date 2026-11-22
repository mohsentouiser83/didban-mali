import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Pagination } from "@/components/ui/pagination";
import { StatusMessage } from "@/components/ui/content-states";
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
import type { useInventoryOverview } from "@/hooks/use-inventory";
import { inventoryInvoicePath, inventoryTitle } from "@/lib/inventory";
import { amount, displayDate, persian } from "@/lib/utils";
import { Panel } from "./page-parts";

type InventoryOverview = ReturnType<typeof useInventoryOverview>;

export function InventoryBalanceTable({
  view,
  onViewKardex,
}: {
  view: InventoryOverview;
  onViewKardex?: (itemId?: string, warehouseId?: string) => void;
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
                  {persian(row.quantity)}
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

export function InventoryKardexDrawer({
  view,
  target,
  onClose,
}: {
  view: InventoryOverview;
  target: { itemId?: string; warehouseId?: string } | null;
  onClose: () => void;
}) {
  if (!target) return null;
  const filtered = view.movements.filter(
    (m) =>
      (!target.itemId || m.item_id === target.itemId) &&
      (!target.warehouseId || m.warehouse_id === target.warehouseId),
  );
  const itemName = target.itemId
    ? view.itemNames.get(target.itemId)
    : undefined;
  const warehouseName = target.warehouseId
    ? view.warehouseNames.get(target.warehouseId)
    : undefined;

  return (
    <Drawer
      title={itemName ? `کاردکس کالا: ${itemName}` : "گردش کل کالاهای انبار"}
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className="sm:max-w-3xl"
    >
      <div className="space-y-4">
        {itemName && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/80 bg-canvas/50 p-3 text-xs">
            {warehouseName && (
              <span>
                انبار:{" "}
                <bdi className="font-medium text-foreground">
                  {warehouseName}
                </bdi>
              </span>
            )}
            <span className="text-muted">
              تعداد گردش‌های ثبت‌شده:{" "}
              <bdi className="font-medium text-foreground">
                {persian(filtered.length)}
              </bdi>
            </span>
          </div>
        )}
        <Table aria-label="گردش کالا" title={itemName ? `کاردکس: ${itemName}` : "گردش کالا"}>
          <TableHeader>
            <TableRow>
              <TableHead>نوع گردش</TableHead>
              <TableHead>تاریخ</TableHead>
              {!target.itemId && <TableHead>کالا و انبار</TableHead>}
              <TableHead>تغییر تعداد</TableHead>
              <TableHead>تغییر ارزش (ریال)</TableHead>
              <TableHead>عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? (
              filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableRowHeader>{inventoryTitle[row.kind]}</TableRowHeader>
                  <TableCell className="whitespace-nowrap">
                    {displayDate(row.date)}
                  </TableCell>
                  {!target.itemId && (
                    <TableCell>
                      {view.itemNames.get(row.item_id) || "—"}
                      <span className="block text-xs text-muted">
                        {view.warehouseNames.get(row.warehouse_id) || "—"}
                      </span>
                    </TableCell>
                  )}
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
                        className="min-h-8 px-2.5 py-1 text-xs"
                        onClick={() => view.journal.select(row.journal_id)}
                      >
                        سند نهایی
                      </Button>
                      {row.kind !== "reversal" && (
                        <ButtonLink
                          variant="ghost"
                          className="min-h-8 px-2.5 py-1 text-xs"
                          href={inventoryInvoicePath(
                            row.kind,
                            row.operation_id,
                          )}
                        >
                          فاکتور
                        </ButtonLink>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableEmptyCell
                colSpan={target.itemId ? 5 : 6}
                title="گردشی برای این کالا ثبت نشده است"
              />
            )}
          </TableBody>
        </Table>
      </div>
    </Drawer>
  );
}

// Retained for backward-compatibility if referenced elsewhere
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
                    {row.kind !== "reversal" && (
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
