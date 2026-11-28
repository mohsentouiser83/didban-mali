import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { Badge } from "@/components/ui/badge";
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
import { persian } from "@/lib/utils";

const subjectLabels: Record<number, string> = {
  1: "اصلی (۱)",
  2: "اصلاحی (۲)",
  3: "ابطالی (۳)",
  4: "برگشت از فروش (۴)",
};

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
          <TableHead>فاکتور و نسخه</TableHead>
          <TableHead>موضوع / مرجع</TableHead>
          <TableHead>شناسه مالیاتی</TableHead>
          <TableHead>کد پیگیری</TableHead>
          <TableHead>وضعیت</TableHead>
          <TableHead>عملیات</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {!rows.length ? (
          <TableEmptyCell colSpan={6} title="صورتحسابی برای ارسال ثبت نشده است" />
        ) : rows.map((row) => {
          const status = moadianStatus(row.status);
          const needsInquiry = row.can_inquire || ["unknown", "sent"].includes(row.status);
          return (
            <TableRow key={row.id}>
              <TableRowHeader>
                <div><bdi>{row.invoice_reference}</bdi></div>
                <div className="text-xs text-muted">نسخه {persian(row.invoice_version)}</div>
              </TableRowHeader>
              <TableCell className="text-xs">
                <div>{subjectLabels[row.invoice_subject ?? 1] ?? "اصلی (۱)"}</div>
                {row.reference_tax_id && (
                  <div dir="ltr" className="font-mono text-muted">مرجع: {row.reference_tax_id}</div>
                )}
              </TableCell>
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
                {needsInquiry || row.can_retry ? (
                  <TableRowActions label={`عملیات ${row.invoice_reference}`}>
                    {needsInquiry && (
                      <TableRowAction
                        disabled={busy}
                        busy={inquiring === row.id}
                        onClick={() => onInquire(row)}
                        aria-label={`استعلام وضعیت فاکتور ${row.invoice_reference}`}
                      >
                        استعلام وضعیت
                      </TableRowAction>
                    )}
                    {row.can_retry && (
                      <TableRowAction
                        disabled={busy}
                        onClick={() => onRetry(row)}
                        aria-label={`ارسال دوباره فاکتور ${row.invoice_reference}`}
                      >
                        ارسال دوباره
                      </TableRowAction>
                    )}
                  </TableRowActions>
                ) : "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
