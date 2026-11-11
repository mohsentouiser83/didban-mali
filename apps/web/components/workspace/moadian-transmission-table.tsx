import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { moadianStatus, type MoadianTransmission } from "@/lib/moadian-transmissions";

export function MoadianTransmissionTable({
  rows,
  busy,
  inquiring,
  onInquire,
  onRetry,
}: {
  rows: MoadianTransmission[];
  busy: boolean;
  inquiring?: string;
  onInquire: (row: MoadianTransmission) => void;
  onRetry: (row: MoadianTransmission) => void;
}) {
  return (
    <Table aria-label="سوابق ارسال صورتحساب به مؤدیان">
      <TableHeader>
        <TableRow>
          <TableHead>فاکتور</TableHead>
          <TableHead>شناسه مالیاتی</TableHead>
          <TableHead>کد پیگیری</TableHead>
          <TableHead>وضعیت</TableHead>
          <TableHead>عملیات</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {!rows.length ? (
          <TableEmptyCell colSpan={5} title="صورتحسابی برای ارسال ثبت نشده است" />
        ) : rows.map((row) => {
          const status = moadianStatus(row.status);
          return (
            <TableRow key={row.id}>
              <TableRowHeader><bdi>{row.invoice_reference}</bdi></TableRowHeader>
              <TableCell><bdi className="break-all">{row.tax_id || "—"}</bdi></TableCell>
              <TableCell>
                <bdi className="break-all">{row.reference_number || "—"}</bdi>
                {row.uid && (
                  <p className="mt-2 text-xs text-muted">
                    شناسه ارسال <bdi className="break-all">{row.uid}</bdi>
                  </p>
                )}
              </TableCell>
              <TableCell>
                <Badge tone={status.tone}>{status.label}</Badge>
                {!!row.error_codes.length && (
                  <p className="mt-2 text-xs text-muted">
                    کد خطا <bdi>{row.error_codes.join("، ")}</bdi>
                  </p>
                )}
              </TableCell>
              <TableCell>
                {row.can_inquire || row.can_retry ? (
                  <div className="flex flex-wrap gap-2">
                    {row.can_inquire && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        busy={inquiring === row.id}
                        onClick={() => onInquire(row)}
                        aria-label={`استعلام وضعیت فاکتور ${row.invoice_reference}`}
                      >
                        استعلام وضعیت
                      </Button>
                    )}
                    {row.can_retry && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => onRetry(row)}
                        aria-label={`ارسال دوباره فاکتور ${row.invoice_reference}`}
                      >
                        ارسال دوباره
                      </Button>
                    )}
                  </div>
                ) : "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
