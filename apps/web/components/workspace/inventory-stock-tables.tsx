import { Button, ButtonLink } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/content-states";
import { Pagination } from "@/components/ui/pagination";
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

export function InventoryBalanceTable({ view }: { view: InventoryOverview }) {
  return (
    <Panel title="موجودی ثبت‌شده">
      <Table aria-label="موجودی ثبت‌شده">
        <TableHeader>
          <TableRow>
            <TableHead>کالا</TableHead>
            <TableHead>انبار</TableHead>
            <TableHead>تعداد</TableHead>
            <TableHead>ارزش موجودی (ریال)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.balances.length ? view.balances.map((row) => (
            <TableRow key={`${row.item_id}:${row.warehouse_id}`}>
              <TableRowHeader>{view.itemNames.get(row.item_id) || "—"}</TableRowHeader>
              <TableCell>{view.warehouseNames.get(row.warehouse_id) || "—"}</TableCell>
              <TableCell>{persian(row.quantity)}</TableCell>
              <TableCell className="whitespace-nowrap">{amount(row.value_irr)}</TableCell>
            </TableRow>
          )) : <TableEmptyCell colSpan={4} title="موجودی ثبت‌شده‌ای در این دامنه نیست" />}
        </TableBody>
      </Table>
      <Pagination {...view.balancePagination} />
    </Panel>
  );
}

export function InventoryMovementTable({ view }: { view: InventoryOverview }) {
  return (
    <Panel title="گردش نهایی کالا">
      {view.inventory.data?.movements_truncated && (
        <div className="mb-4">
          <StatusMessage tone="primary">فهرست به ۱۰۰ گردش آخر شرکت محدود است.</StatusMessage>
        </div>
      )}
      <Table aria-label="گردش نهایی کالا">
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
          {view.movements.length ? view.movements.map((row) => (
            <TableRow key={row.id}>
              <TableRowHeader>{inventoryTitle[row.kind]}</TableRowHeader>
              <TableCell className="whitespace-nowrap">{displayDate(row.date)}</TableCell>
              <TableCell>
                {view.itemNames.get(row.item_id) || "—"}
                <span className="block text-xs text-muted">{view.warehouseNames.get(row.warehouse_id) || "—"}</span>
              </TableCell>
              <TableCell><bdi>{row.quantity > 0 ? "+" : ""}{persian(row.quantity)}</bdi></TableCell>
              <TableCell className="whitespace-nowrap"><bdi>{amount(row.value_irr)}</bdi></TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => view.journal.select(row.journal_id)}>
                    سند نهایی
                  </Button>
                  {row.kind !== "reversal" && (
                    <ButtonLink variant="ghost" href={inventoryInvoicePath(row.kind, row.operation_id)}>
                      فاکتور و تسویه
                    </ButtonLink>
                  )}
                </div>
              </TableCell>
            </TableRow>
          )) : <TableEmptyCell colSpan={6} title="گردش نهایی در این دامنه ثبت نشده" />}
        </TableBody>
      </Table>
      <Pagination {...view.movementPagination} />
    </Panel>
  );
}
