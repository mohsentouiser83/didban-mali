import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import {
  Table,
  TableHeader,
  TableHead,
  TableRowHeader,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { persianDigits } from "@/lib/dates";
import type { CashflowDayModel } from "./cashflow-report-presentation";
export function CashflowDayDetails({
  day,
  unit,
  offset,
  onOffset,
  onClose,
}: {
  day: CashflowDayModel;
  unit: string;
  offset: number;
  onOffset: (v: number) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      title={`گردش ${day.date}`}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-4 rounded-panel border border-border p-4">
          {[
            ["مانده ابتدا", day.opening],
            ["مانده پایان", day.closing],
            ["واریز ثبت‌شده", day.inflow],
            ["برداشت ثبت‌شده", day.outflow],
            ["ورود خارجی", day.externalIn],
            ["خروج خارجی", day.externalOut],
            ["انتقال داخلی خالص", day.internal],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-2 tabular-nums">
                <bdi>{value}</bdi> {unit}
              </dd>
            </div>
          ))}
        </dl>
        {day.reasons.map((r) => (
          <p key={r} className="text-xs text-muted">
            {r}
          </p>
        ))}
        {day.movements.length ? (
          <>
            <p className="text-xs text-muted">
              تراکنش‌های {persianDigits(String(offset + 1))} تا{" "}
              {persianDigits(
                String(Math.min(offset + 25, day.movements.length)),
              )}{" "}
              از {persianDigits(String(day.movements.length))}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>حساب</TableHead>
                  <TableHead>مرجع</TableHead>
                  <TableHead>مبلغ · {unit}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {day.movements.slice(offset, offset + 25).map((m) => (
                  <TableRow key={m.source_row_id}>
                    <TableRowHeader>
                      {m.account_name}
                      <span className="mt-1 block text-xs text-muted">
                        {m.sheet_name} · ردیف{" "}
                        {persianDigits(String(m.row_number))}
                      </span>
                    </TableRowHeader>
                    <TableCell>
                      <bdi>{m.reference ?? "—"}</bdi>
                    </TableCell>
                    <TableCell>
                      <bdi className="tabular-nums">{m.amount}</bdi>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={offset === 0}
                onClick={() => onOffset(Math.max(0, offset - 25))}
              >
                قبلی
              </Button>
              <Button
                variant="secondary"
                disabled={offset + 25 >= day.movements.length}
                onClick={() => onOffset(offset + 25)}
              >
                بعدی
              </Button>
            </div>
          </>
        ) : (
          <EmptyState title="تراکنش ثبت‌شده‌ای برای این روز نیست" />
        )}
      </div>
    </Dialog>
  );
}
export type AccountModel = {
  key: string;
  name: string;
  balance: string;
  reason: string;
};
export function CashflowAccounts({
  accounts,
  unit,
  onClose,
}: {
  accounts: AccountModel[];
  unit: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      title="مانده حساب‌های بانکی"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {accounts.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>حساب</TableHead>
              <TableHead>مانده · {unit}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.key}>
                <TableRowHeader>
                  {a.name}
                  {a.reason ? (
                    <p className="mt-2 max-w-64 text-xs text-muted">
                      {a.reason}
                    </p>
                  ) : null}
                </TableRowHeader>
                <TableCell>
                  <bdi className="tabular-nums">{a.balance}</bdi>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title="حساب قابل مشاهده موجود نیست" />
      )}
    </Dialog>
  );
}
