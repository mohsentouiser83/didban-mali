"use client";
import { useState, type FormEvent, type RefObject } from "react";
import { PageHeader } from "@/features/companies/company-view";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Field, Input, FormMessage } from "@/components/ui/field";
import { FilePicker } from "@/components/ui/file-picker";
import { Select } from "@/components/ui/select";
import { PayrollDateField } from "./payroll-fields";
import { formatMoney } from "@/features/results/presentation";
import { formatDate, persianDigits } from "@/lib/dates";
import type {
  Area,
  Employee,
  Contract,
  Work,
  Rule,
  Run,
  Summary,
  Access,
} from "./types";
const titles: Record<Area, string> = {
  employees: "کارکنان",
  contracts: "قراردادهای کارکنان",
  work: "کارکرد کارکنان",
  rules: "قواعد حقوق‌ودستمزد",
  runs: "حقوق‌ودستمزد",
};
function amount(value: string) {
  return formatMoney(value, "IRR");
}
export function PayrollView({
  area,
  employees,
  contracts,
  work,
  rules,
  runs,
  summary,
  access,
  canReviewRules,
  onCreate,
  onEdit,
  onReview,
  onOpen,
  onImport,
  importButtonRef,
  onEmployee,
  onTemplate,
  employeeNames,
  more,
  loadingMore,
  onMore,
  busy,
}: {
  area: Area;
  employees: Employee[];
  contracts: Contract[];
  work: Work[];
  rules: Rule[];
  runs: Run[];
  summary: Summary;
  access: Access;
  canReviewRules: boolean;
  busy: boolean;
  onCreate: () => void;
  onEdit: (e: Employee) => void;
  onReview: (r: Rule) => void;
  onOpen: (r: Run) => void;
  onImport: (file: File) => void;
  importButtonRef: RefObject<HTMLButtonElement | null>;
  onEmployee: (employee: Employee) => void;
  onTemplate: () => void;
  employeeNames: Record<string, string>;
  more: boolean;
  loadingMore: boolean;
  onMore: () => void;
}) {
  return (
    <section className="space-y-6 motion-safe:animate-reveal">
      <PageHeader
        icon="Users"
        title={titles[area]}
        action={
          access.manage ? (
            <Button onClick={onCreate}>
              {" "}
              {area === "runs"
                ? "محاسبه جدید"
                : area === "work"
                  ? "ثبت کارکرد"
                  : area === "rules"
                    ? "قواعد جدید"
                    : area === "contracts"
                      ? "قرارداد جدید"
                      : "کارمند جدید"}
            </Button>
          ) : undefined
        }
      />
      {area === "employees" || area === "runs" ? (
        <StatCards>
          <StatCard
            title="کارکنان فعال امروز"
            value={persianDigits(String(summary.active_employees))}
            unit="نفر"
          />
          {area === "employees" ? (
            <StatCard
              title={`ورود از ${formatDate(summary.period_start)} تا ${formatDate(summary.period_end)}`}
              value={persianDigits(String(summary.hires))}
              unit="نفر"
            />
          ) : (
            <StatCard
              title="جمع حقوق تأییدشده"
              value={amount(summary.net)}
              unit="ریال"
            />
          )}
          {area === "employees" ? (
            <StatCard
              title={`خروج از ${formatDate(summary.period_start)} تا ${formatDate(summary.period_end)}`}
              value={persianDigits(String(summary.departures))}
              unit="نفر"
            />
          ) : (
            <StatCard
              title="مانده پرداخت حقوق"
              value={amount(summary.unpaid)}
              unit="ریال"
            />
          )}
        </StatCards>
      ) : null}
      {access.manage && (area === "employees" || area === "work") ? (
        <div className="space-y-3">
          <Button variant="ghost" onClick={onTemplate}>
            قالب ورود گروهی
          </Button>
          <FilePicker
            buttonRef={importButtonRef}
            label={
              area === "employees" ? "ورود گروهی کارکنان" : "ورود گروهی کارکرد"
            }
            multiple={false}
            accept=".csv,.xlsx"
            compact
            disabled={busy}
            onFiles={(files) => {
              if (files[0]) onImport(files[0]);
            }}
          />
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            {area === "employees" ? (
              <>
                <TableHead>کارمند</TableHead>
                <TableHead>کد پرسنلی</TableHead>
                <TableHead>واحد</TableHead>
                <TableHead>استخدام</TableHead>
              </>
            ) : area === "contracts" ? (
              <>
                <TableHead>کارمند</TableHead>
                <TableHead>اعتبار</TableHead>
                <TableHead>مزد مبنا — ریال</TableHead>
                <TableHead>مبنای مزد</TableHead>
              </>
            ) : area === "work" ? (
              <>
                <TableHead>کارمند</TableHead>
                <TableHead>بازه</TableHead>
                <TableHead>روز کارکرد</TableHead>
                <TableHead>نسخه</TableHead>
              </>
            ) : area === "rules" ? (
              <>
                <TableHead>نام قواعد</TableHead>
                <TableHead>اعتبار</TableHead>
                <TableHead>وضعیت بررسی</TableHead>
              </>
            ) : (
              <>
                <TableHead>بازه</TableHead>
                <TableHead>نوع</TableHead>
                <TableHead>خالص — ریال</TableHead>
                <TableHead>وضعیت</TableHead>
              </>
            )}
            <TableHead>عملیات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {area === "employees"
            ? employees.map((e) => (
                <TableRow key={e.id}>
                  <TableRowHeader>{e.profile.name}</TableRowHeader>
                  <TableCell dir="ltr">{e.personnel_code}</TableCell>
                  <TableCell>{e.profile.department || "—"}</TableCell>
                  <TableCell>{formatDate(e.profile.hired_on)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" onClick={() => onEmployee(e)}>
                      پرونده
                    </Button>
                    {access.manage ? (
                      <Button variant="ghost" onClick={() => onEdit(e)}>
                        ویرایش
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            : null}
          {area === "contracts"
            ? contracts.map((c) => (
                <TableRow key={c.id}>
                  <TableRowHeader>
                    {employeeNames[c.employee_id] || "—"}
                  </TableRowHeader>
                  <TableCell>
                    {formatDate(c.effective_from)}{" "}
                    {c.effective_to ? "تا " + formatDate(c.effective_to) : ""}
                  </TableCell>
                  <TableCell>{amount(String(c.content.base_amount))}</TableCell>
                  <TableCell>
                    {{ monthly: "ماهانه", daily: "روزانه", hourly: "ساعتی" }[
                      String(c.content.pay_basis)
                    ] ?? "نامشخص"}
                  </TableCell>
                  <TableCell>ثبت‌شده</TableCell>
                </TableRow>
              ))
            : null}
          {area === "work"
            ? work.map((w) => (
                <TableRow key={w.id}>
                  <TableRowHeader>
                    {employeeNames[w.employee_id] || "—"}
                  </TableRowHeader>
                  <TableCell>
                    {formatDate(w.period_start)} تا {formatDate(w.period_end)}
                  </TableCell>
                  <TableCell>
                    {persianDigits(String(w.content.worked_days))}
                  </TableCell>
                  <TableCell>{persianDigits(String(w.revision))}</TableCell>
                  <TableCell>ثبت‌شده</TableCell>
                </TableRow>
              ))
            : null}
          {area === "rules"
            ? rules.map((r) => (
                <TableRow key={r.id}>
                  <TableRowHeader>{r.name}</TableRowHeader>
                  <TableCell>
                    {formatDate(r.effective_from)} تا{" "}
                    {formatDate(r.effective_to)}
                  </TableCell>
                  <TableCell>
                    <Badge>
                      {r.legal_verified
                        ? "قواعد تأییدشده"
                        : r.reviewed
                          ? "نمونه بررسی‌شده؛ تأیید قانونی لازم است"
                          : "نیازمند نمونه مرجع"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {access.manage && canReviewRules && !r.reviewed ? (
                      <Button variant="ghost" onClick={() => onReview(r)}>
                        بررسی نمونه مرجع
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            : null}
          {area === "runs"
            ? runs.map((r) => (
                <TableRow key={r.id}>
                  <TableRowHeader>
                    {formatDate(r.period_start)} تا {formatDate(r.period_end)}
                  </TableRowHeader>
                  <TableCell>
                    {{
                      monthly: "حقوق دوره",
                      eidi: "عیدی",
                      sanavat: "سنوات",
                      termination: "تسویه",
                      arrears: "معوقات",
                    }[r.kind] ?? "نامشخص"}
                  </TableCell>
                  <TableCell>{amount(r.content.totals.net)}</TableCell>
                  <TableCell>
                    <Badge>
                      {r.approved
                        ? "تأییدشده"
                        : r.content.legal_verified
                          ? "در انتظار تأیید"
                          : "محاسبه اولیه"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" onClick={() => onOpen(r)}>
                      جزئیات
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            : null}
          {{ employees, contracts, work, rules, runs }[area].length === 0 ? (
            <TableRow>
              <TableEmptyCell
                colSpan={area === "rules" ? 4 : 5}
                title="اطلاعاتی ثبت نشده است"
              />
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      {more ? (
        <div className="flex justify-center">
          <Button variant="secondary" disabled={loadingMore} onClick={onMore}>
            {loadingMore ? "در حال دریافت…" : "نمایش بیشتر"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function RunDetails({
  run,
  access,
  busy,
  error,
  onClose,
  onApprove,
  onExport,
  onPayment,
  onFinancial,
}: {
  run: Run;
  access: Access;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onApprove: () => void;
  onExport: (format: "pdf" | "xlsx" | "insurance" | "tax") => void;
  onPayment: (e: FormEvent<HTMLFormElement>) => void;
  onFinancial: () => void;
}) {
  const [employee, setEmployee] = useState(
    run.content.items[0]?.employee_id ?? "",
  );
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="جزئیات محاسبه حقوق"
      busy={busy}
    >
      <div className="space-y-5">
        {!run.content.legal_verified ? (
          <p className="text-sm text-warning">
            محاسبه اولیه؛ تأیید مستقل قواعد قانونی لازم است.
          </p>
        ) : null}
        <p className="text-sm">
          {formatDate(run.period_start)} تا {formatDate(run.period_end)}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>کارمند</TableHead>
              <TableHead>ناخالص</TableHead>
              <TableHead>بیمه</TableHead>
              <TableHead>مالیات</TableHead>
              <TableHead>خالص — ریال</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {run.content.items.map((i) => (
              <TableRow key={i.employee_id}>
                <TableRowHeader>{i.profile.name}</TableRowHeader>
                <TableCell>{amount(i.result.gross)}</TableCell>
                <TableCell>{amount(i.result.employee_insurance)}</TableCell>
                <TableCell>{amount(i.result.tax)}</TableCell>
                <TableCell>{amount(i.result.net)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <FormMessage>{error}</FormMessage>
        <div className="flex flex-wrap gap-3">
          {!run.approved && access.approve && run.content.legal_verified ? (
            <Button onClick={onApprove} disabled={busy}>
              تأیید این نسخه حقوق
            </Button>
          ) : null}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onExport("pdf")}
          >
            {run.approved ? "فیش PDF" : "پیش‌نمایش PDF"}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onExport("xlsx")}
          >
            {run.approved ? "لیست Excel" : "پیش‌نمایش Excel"}
          </Button>
          {run.approved ? (
            <>
              {access.manage ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={onFinancial}
                >
                  اتصال به برنامه پرداخت
                </Button>
              ) : null}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => onExport("insurance")}
              >
                فایل بیمه
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => onExport("tax")}
              >
                فایل مالیات
              </Button>
            </>
          ) : null}
        </div>
        {run.approved && access.manage ? (
          <Form
            onSubmit={onPayment}
            className="space-y-4 rounded-panel border border-border p-4"
          >
            <h3 className="font-medium">ثبت پرداخت انجام‌شده</h3>
            <Select
              id="payment_employee_id"
              name="employee_id"
              label="کارمند"
              value={employee}
              onValueChange={setEmployee}
              options={run.content.items.map((i) => ({
                value: i.employee_id,
                label: i.profile.name,
              }))}
            />
            <Field id="payment_amount" label="مبلغ — ریال">
              <Input
                id="payment_amount"
                name="amount"
                inputMode="decimal"
                dir="ltr"
                required
                pattern="[0-9]+([.][0-9]{1,6})?"
              />
            </Field>
            <PayrollDateField
              id="paid_on"
              name="paid_on"
              label="تاریخ پرداخت"
              required
            />
            <Field id="reference" label="مرجع پرداخت">
              <Input id="reference" name="reference" required />
            </Field>
            <Field id="bank_movement_id" label="شناسه گردش بانک؛ اختیاری">
              <Input id="bank_movement_id" name="bank_movement_id" dir="ltr" />
            </Field>
            <Button type="submit" disabled={busy}>
              ثبت وضعیت پرداخت
            </Button>
          </Form>
        ) : null}
      </div>
    </Dialog>
  );
}
export { ImportDetails } from "./payroll-import-controller";

export { EmployeeDetails } from "./employee-details-view";
