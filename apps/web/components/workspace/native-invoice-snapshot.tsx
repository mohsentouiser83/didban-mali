"use client";
import { Drawer } from "@/components/ui/drawer";
import { ButtonLink } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/content-states";
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
import { amount, displayDate } from "@/lib/utils";
import { nativeInvoiceReason } from "@/lib/native-invoices";
import type { NativeInvoicesController } from "@/hooks/use-native-invoices";
export function NativeInvoiceSnapshot({
  view,
}: {
  view: NativeInvoicesController;
}) {
  return (
    <Drawer
      open={!!view.snapshotId}
      onOpenChange={(open) => {
        if (!open) view.selectSnapshot("");
      }}
      title="نسخهٔ ثابت فاکتورها"
    >
      {view.savedSnapshot.loading ? (
        <LoadingState label="در حال دریافت نسخهٔ ثابت" />
      ) : view.savedSnapshot.error ? (
        <ErrorState
          message={view.savedSnapshot.error.message}
          onRetry={view.savedSnapshot.refresh}
        />
      ) : (
        view.savedSnapshot.data && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              تا {displayDate(view.savedSnapshot.data.payload.as_of)}
            </p>
            <div className="flex flex-wrap gap-2">
              {(["pdf", "xlsx"] as const).map((format) => (
                <ButtonLink
                  key={format}
                  download
                  variant="secondary"
                  href={`/api/v1${view.workspace.companyPath(`accounting/native-invoices/snapshots/${view.savedSnapshot.data!.id}/export?format=${format}`)}`}
                >
                  دریافت {format.toUpperCase()}
                </ButtonLink>
              ))}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>مرجع</TableHead>
                  <TableHead>طرف حساب</TableHead>
                  <TableHead>سررسید</TableHead>
                  <TableHead>مانده (ریال)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.snapshotRows.length ? (
                  view.snapshotRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableRowHeader>{row.reference}</TableRowHeader>
                      <TableCell>{row.party_id}</TableCell>
                      <TableCell>
                        {row.terms?.due_date
                          ? displayDate(row.terms.due_date)
                          : "نامشخص"}
                      </TableCell>
                      <TableCell>
                        {amount(row.remaining)}
                        {row.reason && (
                          <span className="block text-xs text-muted">
                            {nativeInvoiceReason(row.reason)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell colSpan={4} title="این نسخه فاکتوری ندارد" />
                )}
              </TableBody>
            </Table>
            <Pagination
              page={view.snapshotPage}
              total={view.snapshotTotal}
              onPrevious={view.previousSnapshotPage}
              onNext={view.nextSnapshotPage}
            />
          </div>
        )
      )}
    </Drawer>
  );
}
