import { AppIcon } from "@/components/ui/app-icon";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import type { DetailModel } from "./presentation";

export function ManagementDetails({
  detail,
  onClose,
  onNext,
  onPrevious,
}: {
  detail: DetailModel | null;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <Dialog
      icon="ClipboardList"
      title={detail?.title ?? "شواهد گزارش"}
      open={!!detail}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {detail?.rows.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>حساب و تاریخ</TableHead>
                <TableHead>مبلغ</TableHead>
                <TableHead>برگه و ردیف</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.rows.map((row, i) => (
                <TableRow key={`${row.key}-${i}`}>
                  <TableRowHeader>
                    {row.account}
                    <span className="mt-1 block text-xs text-muted">
                      {row.date}
                    </span>
                  </TableRowHeader>
                  <TableCell>
                    <bdi className="tabular-nums">{row.amount}</bdi>
                  </TableCell>
                  <TableCell>
                    <span className="break-all">{row.file}</span>
                    <span className="mt-1 block text-xs text-muted">
                      ردیف {row.row}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="secondary"
              disabled={!detail.previous}
              onClick={onPrevious}
            >
              <AppIcon name="ChevronRight" />
              قبلی
            </Button>
            <span className="text-sm text-muted">{detail.page}</span>
            <Button
              variant="secondary"
              disabled={!detail.more}
              onClick={onNext}
            >
              <AppIcon name="ChevronLeft" />
              بعدی
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          icon="FileSearch"
          title="ردیف منبعی برای این بخش موجود نیست"
        />
      )}
    </Dialog>
  );
}
