"use client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableRowHeader,
  TableEmptyCell,
} from "@/components/ui/table";
import { StatCard, StatCards } from "@/components/ui/financial/stat-cards";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { formatMoney } from "@/features/results/presentation";
import { formatDate, persianDigits } from "@/lib/dates";
import type { Employee, Contract, Work, Run } from "./types";
export type EmployeeStats = {
  content: {
    payment_next_cursor: string | null;
    as_of_date: string;
    approved_run_count: number;
    contract_count: number;
    work_count: number;
    history_run_count: number;
    net: string;
    paid: string;
    unpaid: string;
    loan_remaining: string | null;
    advance_remaining: string | null;
    leave: { days: string | null; as_of_date: string | null; basis?: string };
    payments: {
      id: string;
      paid_on: string;
      amount: string;
      reference: string;
    }[];
    profile_versions: { version: number; created_at: string }[];
  };
};
const amount = (value: string | null) => formatMoney(value, "IRR");
export function EmployeeDetails({
  employee,
  contracts,
  work,
  runs,
  onClose,
  stats,
  loading,
  error,
  onRetry,
  morePayments,
  loadingPayments,
  onMorePayments,
  moreHistory,
  loadingHistory,
  onMoreHistory,
}: {
  employee: Employee;
  contracts: Contract[];
  work: Work[];
  runs: Run[];
  onClose: () => void;
  stats?: EmployeeStats;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  morePayments: boolean;
  loadingPayments: boolean;
  onMorePayments: () => void;
  moreHistory: Record<"contracts" | "work" | "runs", boolean>;
  loadingHistory: Record<"contracts" | "work" | "runs", boolean>;
  onMoreHistory: (kind: "contracts" | "work" | "runs") => void;
}) {
  if (loading)
    return (
      <Dialog
        open
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
        title={employee.profile.name}
      >
        <LoadingState />
      </Dialog>
    );
  if (error)
    return (
      <Dialog
        open
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
        title={employee.profile.name}
      >
        <ErrorState message={error} onRetry={onRetry} />
      </Dialog>
    );
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={employee.profile.name}
    >
      <div className="space-y-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          {Object.entries({
            personnel_code: employee.personnel_code,
            insurance_number: employee.profile.insurance_number,
            department: employee.profile.department,
            position: employee.profile.position,
            opening_loan: employee.profile.opening_loan,
            opening_advance: employee.profile.opening_advance,
            opening_leave_days: employee.profile.opening_leave_days,
          }).map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs text-muted">
                {
                  {
                    personnel_code: "کد پرسنلی",
                    insurance_number: "شماره بیمه",
                    department: "واحد",
                    position: "سمت",
                    opening_loan: "وام شروع — ریال",
                    opening_advance: "مساعده شروع — ریال",
                    opening_leave_days: "مرخصی شروع — روز",
                  }[key]
                }
              </dt>
              <dd className="mt-1 text-sm">
                {value
                  ? key.startsWith("opening_")
                    ? amount(value)
                    : value
                  : "—"}
              </dd>
            </div>
          ))}
        </dl>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : stats ? (
          <section className="space-y-4">
            <h3 className="font-medium">
              وضعیت ثبت‌شده تا {formatDate(stats.content.as_of_date)}
            </h3>
            <StatCards>
              <StatCard
                title="خالص محاسبات تأییدشده"
                value={amount(stats.content.net)}
                unit="ریال"
              />
              <StatCard
                title="پرداخت ثبت‌شده"
                value={amount(stats.content.paid)}
                unit="ریال"
              />
              <StatCard
                title="مانده این محاسبات"
                value={amount(stats.content.unpaid)}
                unit="ریال"
              />
            </StatCards>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">مانده وام از مانده شروع</dt>
                <dd>{amount(stats.content.loan_remaining)} ریال</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">
                  مانده مساعده از مانده شروع
                </dt>
                <dd>{amount(stats.content.advance_remaining)} ریال</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">
                  مرخصی{" "}
                  {stats.content.leave.as_of_date
                    ? "تا " + formatDate(stats.content.leave.as_of_date)
                    : "شروع"}
                </dt>
                <dd>
                  {stats.content.leave.days === null
                    ? "—"
                    : persianDigits(stats.content.leave.days)}{" "}
                  روز
                </dd>
              </div>
            </dl>
            <h3 className="font-medium">پرداخت‌های ثبت‌شده</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>مبلغ — ریال</TableHead>
                  <TableHead>مرجع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.content.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableRowHeader>{formatDate(p.paid_on)}</TableRowHeader>
                    <TableCell>{amount(p.amount)}</TableCell>
                    <TableCell>{p.reference}</TableCell>
                  </TableRow>
                ))}
                {!stats.content.payments.length ? (
                  <TableRow>
                    <TableEmptyCell colSpan={3} title="پرداختی ثبت نشده است" />
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
            {morePayments ? (
              <Button
                variant="secondary"
                disabled={loadingPayments}
                onClick={onMorePayments}
              >
                {loadingPayments ? "در حال دریافت…" : "پرداخت‌های بیشتر"}
              </Button>
            ) : null}
          </section>
        ) : null}
        <h3 className="font-medium">
          فیش‌ها و سابقه حقوق ·{" "}
          {persianDigits(
            String(stats?.content.history_run_count ?? runs.length),
          )}{" "}
          محاسبه
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>بازه</TableHead>
              <TableHead>خالص — ریال</TableHead>
              <TableHead>مرخصی — روز</TableHead>
              <TableHead>وضعیت</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => {
              const item = r.content.items[0];
              return (
                <TableRow key={r.id}>
                  <TableRowHeader>
                    {formatDate(r.period_start)} تا {formatDate(r.period_end)}
                  </TableRowHeader>
                  <TableCell>{amount(item.result.net)}</TableCell>
                  <TableCell>
                    {amount(item.result.leave_balance_days)}
                  </TableCell>
                  <TableCell>
                    {r.approved ? "تأییدشده" : "محاسبه اولیه"}
                  </TableCell>
                </TableRow>
              );
            })}
            {!runs.length ? (
              <TableRow>
                <TableEmptyCell colSpan={4} title="فیشی ثبت نشده است" />
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {moreHistory.runs ? (
          <Button
            variant="secondary"
            onClick={() => onMoreHistory("runs")}
            disabled={loadingHistory.runs}
          >
            {loadingHistory.runs ? "در حال دریافت…" : "محاسبات بیشتر"}
          </Button>
        ) : null}
        <h3 className="font-medium">
          قراردادها ·{" "}
          {persianDigits(
            String(stats?.content.contract_count ?? contracts.length),
          )}
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>شروع اعتبار</TableHead>
              <TableHead>پایان اعتبار</TableHead>
              <TableHead>مزد مبنا — ریال</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.map((c) => (
              <TableRow key={c.id}>
                <TableRowHeader>{formatDate(c.effective_from)}</TableRowHeader>
                <TableCell>
                  {c.effective_to ? formatDate(c.effective_to) : "—"}
                </TableCell>
                <TableCell>{amount(String(c.content.base_amount))}</TableCell>
              </TableRow>
            ))}
            {!contracts.length ? (
              <TableRow>
                <TableEmptyCell colSpan={3} title="قراردادی ثبت نشده است" />
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {moreHistory.contracts ? (
          <Button
            variant="secondary"
            onClick={() => onMoreHistory("contracts")}
            disabled={loadingHistory.contracts}
          >
            {loadingHistory.contracts ? "در حال دریافت…" : "قراردادهای بیشتر"}
          </Button>
        ) : null}
        <h3 className="font-medium">
          کارکردها ·{" "}
          {persianDigits(String(stats?.content.work_count ?? work.length))}
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>بازه</TableHead>
              <TableHead>روز مزد و بیمه</TableHead>
              <TableHead>نسخه</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {work.map((w) => (
              <TableRow key={w.id}>
                <TableRowHeader>
                  {formatDate(w.period_start)} تا {formatDate(w.period_end)}
                </TableRowHeader>
                <TableCell>
                  {persianDigits(String(w.content.worked_days))}
                </TableCell>
                <TableCell>{persianDigits(String(w.revision))}</TableCell>
              </TableRow>
            ))}
            {!work.length ? (
              <TableRow>
                <TableEmptyCell colSpan={3} title="کارکردی ثبت نشده است" />
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {moreHistory.work ? (
          <Button
            variant="secondary"
            onClick={() => onMoreHistory("work")}
            disabled={loadingHistory.work}
          >
            {loadingHistory.work ? "در حال دریافت…" : "کارکردهای بیشتر"}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}
