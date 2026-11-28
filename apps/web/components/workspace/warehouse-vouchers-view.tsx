"use client";

import { PackageIcon, PlusIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { CursorPagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableEmptyCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/ui/table";
import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { useWarehouseVouchers } from "@/hooks/use-warehouse-vouchers";
import { useWorkspace } from "@/hooks/workspace";
import { canViewPath } from "@/lib/module-access";
import { displayDate, persian } from "@/lib/utils";
import { voucherLabels, voucherStates, type VoucherDirection, type WarehouseVoucherOptions } from "@/lib/warehouse-vouchers";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { WarehouseVoucherForm } from "./warehouse-voucher-form";

export function WarehouseVouchersView({ direction }: { direction: VoucherDirection }) {
  const workspace = useWorkspace();
  if (!workspace.company) return <NoCompany />;
  return <VoucherList key={`${workspace.user?.id}:${workspace.company.id}:${workspace.periodId}:${direction}`}
    direction={direction} hasPeriod={workspace.periods.some((period) => period.id === workspace.periodId)}
    canReview={canViewPath(workspace.company, "/accounting")} />;
}

function VoucherList({ direction, canReview, hasPeriod }: { direction: VoucherDirection; canReview: boolean; hasPeriod: boolean }) {
  const view = useWarehouseVouchers(direction);
  const { vouchers, options } = view;
  const labels = voucherLabels[direction];

  return (
    <>
      <PageHeader title={labels.title} icon={PackageIcon}
        action={options.data?.can_create && (
          <Button onClick={view.open}>
            <PlusIcon aria-hidden size={18} />
            {labels.add}
          </Button>
        )} />
      {options.error && <ErrorState message={options.error.message} onRetry={options.refresh} />}
      <Panel>
        {vouchers.loading ? (
          <LoadingState variant="table" />
        ) : vouchers.error ? (
          <ErrorState message={vouchers.error.message} onRetry={vouchers.refresh} />
        ) : (
          <>
            <Table aria-label={labels.title} title={labels.title} columnControls={false}>
              <TableHeader>
                <TableRow>
                  <TableHead>شماره سند</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>{labels.warehouse}</TableHead>
                  <TableHead numeric>تعداد اقلام</TableHead>
                  <TableHead>شماره مرجع</TableHead>
                  <TableHead>شرح</TableHead>
                  <TableHead>وضعیت</TableHead>
                  {canReview && <TableHead>عملیات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {vouchers.data?.items.length ? vouchers.data.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableRowHeader><bdi>{row.source_reference}</bdi></TableRowHeader>
                    <TableCell>{displayDate(row.date)}</TableCell>
                    <TableCell>{row.warehouse_name}</TableCell>
                    <TableCell numeric>{persian(row.item_count)}</TableCell>
                    <TableCell><bdi>{row.reference || "—"}</bdi></TableCell>
                    <TableCell className="max-w-64 whitespace-normal wrap-anywhere">{row.description}</TableCell>
                    <TableCell><Badge tone={voucherStates[row.state].tone}>{voucherStates[row.state].label}</Badge></TableCell>
                    {canReview && <TableCell>
                      {row.state === "draft" ? (
                        <TableRowActions label={`عملیات سند ${row.source_reference}`}>
                          <TableRowAction kind="view" href={`/accounting?review_draft=${encodeURIComponent(row.draft_id)}`}>
                            مشاهده پیش‌نویس
                          </TableRowAction>
                        </TableRowActions>
                      ) : "—"}
                    </TableCell>}
                  </TableRow>
                )) : <TableEmptyCell colSpan={canReview ? 8 : 7} title={labels.empty} />}
              </TableBody>
            </Table>
            <CursorPagination {...vouchers} />
          </>
        )}
      </Panel>
      {view.editor.generation > 0 && options.data && (
        hasPeriod && options.data.items.length && options.data.warehouses.length && options.data.accounts.length ? (
          <WarehouseVoucherForm key={view.editor.generation} open={view.editor.open}
            direction={direction} options={options.data} onClose={view.close} onCreated={view.onCreated} />
        ) : (
          <VoucherPrerequisites open={view.editor.open} hasPeriod={hasPeriod}
            options={options.data} onClose={view.close} title={labels.add} />
        )
      )}
    </>
  );
}

function VoucherPrerequisites({ options, open, hasPeriod, onClose, title }: {
  options: WarehouseVoucherOptions;
  open: boolean;
  hasPeriod: boolean;
  onClose: () => void;
  title: string;
}) {
  return (
    <Drawer open={open} title={title} onOpenChange={(open) => { if (!open) onClose(); }}>
      {!hasPeriod && <StatusMessage>دورهٔ مالی را انتخاب کنید.</StatusMessage>}
      {!options.items.length && <StatusMessage>کالای انباری فعال تعریف کنید.</StatusMessage>}
      {!options.warehouses.length && <StatusMessage>انبار فعال تعریف کنید.</StatusMessage>}
      {!options.accounts.length && <StatusMessage>حساب مقابل قابل ثبت تعریف کنید.</StatusMessage>}
    </Drawer>
  );
}
