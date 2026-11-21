"use client";

import {
  UsersThreeIcon,
  PlusIcon,
  BooksIcon,
  PencilSimpleIcon,
  EyeIcon,
  CheckCircleIcon,
  ClockIcon,
  WalletIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  ArrowClockwiseIcon,
} from "@phosphor-icons/react";
import { usePayrollDashboard } from "@/hooks/use-payroll-dashboard";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState } from "@/components/ui/content-states";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableRowHeader, TableCell, TableEmptyCell } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, AmountInput } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NoCompany, PageHeader, Panel, PeriodFilter } from "./page-parts";
import { amount, persian } from "@/lib/utils";

const monthNames = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

export function PayrollDashboardView() {
  const v = usePayrollDashboard();
  if (!v.workspace.company) return <NoCompany />;

  const currentRun = v.selectedRun;

  return (
    <>
      <PageHeader
        title="حقوق و دستمزد"
        icon={UsersThreeIcon}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => v.setCreateOpen(true)}>
              <PlusIcon size={18} aria-hidden />
              ایجاد لیست حقوق جدید
            </Button>
            {currentRun && currentRun.status !== "posted" && (
              <Button variant="secondary" onClick={v.handleCreateDraft} busy={v.command.busy}>
                <BooksIcon size={18} aria-hidden />
                صدور پیش‌نویس سند حسابداری
              </Button>
            )}
          </div>
        }
      />

      <PeriodFilter />

      {v.loading ? (
        <LoadingState label="در حال بارگذاری لیست‌های حقوق..." />
      ) : v.runs.length === 0 ? (
        <Panel>
          <EmptyState
            title="هیچ لیست حقوقی ایجاد نشده است"
            description="برای شروع محاسبه حقوق و صدور فیش‌ها، اولین لیست حقوق دوره را ایجاد کنید."
            action={
              <Button variant="primary" onClick={() => v.setCreateOpen(true)}>
                ایجاد اولین لیست حقوق
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="space-y-6">
          {/* نوار انتخاب دوره و لیست حقوق */}
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-foreground">انتخاب لیست حقوق ماه:</span>
                <div className="w-64">
                  <Select
                    value={v.selectedRunId || ""}
                    onValueChange={(val) => v.setSelectedRunId(val)}
                    options={v.runs.map((r) => ({
                      value: r.id,
                      label: `${r.title} (${monthNames[r.month - 1]} ${persian(r.year)})`,
                    }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                {currentRun?.status === "posted" ? (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                    <CheckCircleIcon size={16} weight="fill" /> سند شناسایی حقوق ثبت شده
                  </span>
                ) : currentRun?.status === "approved" ? (
                  <span className="inline-flex items-center gap-1 rounded bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
                    <CheckCircleIcon size={16} /> پیش‌نویس سند ایجاد شده
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                    <ClockIcon size={16} /> محاسبه‌شده (پیش‌نویس)
                  </span>
                )}
                <Button variant="ghost" className="size-8 p-0" onClick={v.refresh} title="تازه‌سازی">
                  <ArrowClockwiseIcon size={16} />
                </Button>
              </div>
            </div>
          </Panel>

          {/* کارت‌های خلاصه مالی لیست حقوق */}
          {currentRun && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-panel border border-border bg-surface p-4">
                <div className="flex items-center gap-2 text-xs text-muted mb-1">
                  <WalletIcon size={16} className="text-primary" /> ناخالص کل مزایا
                </div>
                <div className="text-xl font-semibold text-foreground">
                  {amount(currentRun.total_gross, v.workspace.unit)}
                </div>
              </div>
              <div className="rounded-panel border border-border bg-surface p-4">
                <div className="flex items-center gap-2 text-xs text-muted mb-1">
                  <ShieldCheckIcon size={16} className="text-sky-600" /> بیمه کارمند (۷٪)
                </div>
                <div className="text-xl font-semibold text-foreground">
                  {amount(currentRun.total_employee_insurance, v.workspace.unit)}
                </div>
              </div>
              <div className="rounded-panel border border-border bg-surface p-4">
                <div className="flex items-center gap-2 text-xs text-muted mb-1">
                  <ShieldCheckIcon size={16} className="text-indigo-600" /> بیمه کارفرما (۲۳٪)
                </div>
                <div className="text-xl font-semibold text-foreground">
                  {amount(currentRun.total_employer_insurance, v.workspace.unit)}
                </div>
              </div>
              <div className="rounded-panel border border-border bg-surface p-4">
                <div className="flex items-center gap-2 text-xs text-muted mb-1">
                  <ReceiptIcon size={16} className="text-amber-600" /> مالیات حقوق (م ۸۴)
                </div>
                <div className="text-xl font-semibold text-foreground">
                  {amount(currentRun.total_tax, v.workspace.unit)}
                </div>
              </div>
              <div className="rounded-panel border border-primary/20 bg-primary-soft/40 p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-primary mb-1">
                  <WalletIcon size={16} className="text-primary" /> خالص کل پرداختنی
                </div>
                <div className="text-xl font-bold text-primary">
                  {amount(currentRun.total_net, v.workspace.unit)}
                </div>
              </div>
            </div>
          )}

          {/* جدول فیش‌ها و کارکرد ماهانه پرسنل */}
          <Panel title={`ریز فیش‌های حقوق ${currentRun?.title || ""}`}>
            {v.runLoading ? (
              <LoadingState label="در حال دریافت فیش‌ها..." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>کد پرسنلی</TableHead>
                    <TableHead>نام کارمند</TableHead>
                    <TableHead>کارکرد (روز/ساعت)</TableHead>
                    <TableHead>اضافه‌کار</TableHead>
                    <TableHead>ناخالص مزایا</TableHead>
                    <TableHead>بیمه کارمند</TableHead>
                    <TableHead>مالیات</TableHead>
                    <TableHead>کسورات متفرقه</TableHead>
                    <TableHead className="font-semibold text-primary">خالص دریافتی ({v.workspace.unit === "IRR" ? "ریال" : "تومان"})</TableHead>
                    <TableHead className="text-end">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentRun?.slips && currentRun.slips.length > 0 ? (
                    currentRun.slips.map((slip) => (
                      <TableRow key={slip.id}>
                        <TableRowHeader>
                          <span dir="ltr" className="font-mono">{slip.employee_code}</span>
                        </TableRowHeader>
                        <TableCell className="font-medium">
                          {slip.employee_name}
                          {Boolean(slip.applied_exemptions?.art_56_veteran_tax_exempt) && (
                            <span className="ms-2 rounded bg-primary-soft px-1 text-[10px] text-primary">ایثارگر</span>
                          )}
                          {Boolean(slip.applied_exemptions?.foreign_national_no_unemployment_insurance) && (
                            <span className="ms-2 rounded bg-amber-100 px-1 text-[10px] text-amber-800">اتباع</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {Number(slip.work_hours) > 0
                            ? `${persian(slip.work_hours)} ساعت`
                            : `${persian(slip.work_days)} روز`}
                        </TableCell>
                        <TableCell>
                          {Number(slip.overtime_hours) > 0 ? `${persian(slip.overtime_hours)} ساعت` : "—"}
                        </TableCell>
                        <TableCell>{amount(slip.gross_pay, v.workspace.unit)}</TableCell>
                        <TableCell>{amount(slip.employee_insurance, v.workspace.unit)}</TableCell>
                        <TableCell>{amount(slip.payroll_tax, v.workspace.unit)}</TableCell>
                        <TableCell>
                          {amount(
                            String(BigInt(slip.advance_payment || 0) + BigInt(slip.loan_installment || 0) + BigInt(slip.other_deductions || 0)),
                            v.workspace.unit,
                          )}
                        </TableCell>
                        <TableCell className="font-bold text-primary">
                          {amount(slip.net_pay, v.workspace.unit)}
                        </TableCell>
                        <TableCell className="text-end">
                          <div className="flex items-center justify-end gap-1">
                            {currentRun.status !== "posted" && (
                              <Button
                                variant="ghost"
                                className="size-8 p-0"
                                onClick={() => v.openEditSlip(slip)}
                                title="ثبت کارکرد / کسورات"
                              >
                                <PencilSimpleIcon size={16} />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              className="size-8 p-0 text-primary"
                              onClick={() => v.setViewingSlip(slip)}
                              title="مشاهده فیش حقوقی"
                            >
                              <EyeIcon size={16} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableEmptyCell
                      colSpan={10}
                      title="هیچ فیشی در این لیست وجود ندارد؛ ابتدا کارمندان و قراردادها را در بخش تنظیمات تعریف کنید."
                    />
                  )}
                </TableBody>
              </Table>
            )}
          </Panel>
        </div>
      )}

      {/* مودال ایجاد لیست حقوق جدید */}
      <Dialog
        open={v.createOpen}
        onOpenChange={(open) => !open && v.setCreateOpen(false)}
        title="ایجاد لیست حقوق و دستمزد جدید"
        description="دوره و ماه مالی مورد نظر را انتخاب کنید تا محاسبات اولیه فیش‌ها انجام شود."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => v.setCreateOpen(false)}>انصراف</Button>
            <Button variant="primary" busy={v.command.busy} onClick={v.handleCreateRun}>
              ایجاد و محاسبه فیش‌ها
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <Field id="run-title" label="عنوان لیست حقوق">
            <Input
              value={v.createForm.title}
              onChange={(e) => v.setCreateForm({ ...v.createForm, title: e.target.value })}
              placeholder="مثال: لیست حقوق فروردین ۱۴۰۳"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="run-year" label="سال">
              <Input
                type="number"
                value={String(v.createForm.year)}
                onChange={(e) => v.setCreateForm({ ...v.createForm, year: Number(e.target.value) || 1403 })}
              />
            </Field>
            <Field id="run-month" label="ماه">
              <Select
                value={String(v.createForm.month)}
                onValueChange={(val) => v.setCreateForm({ ...v.createForm, month: Number(val) })}
                options={monthNames.map((name, i) => ({
                  value: String(i + 1),
                  label: name,
                }))}
              />
            </Field>
          </div>
          <Field id="run-calc-date" label="تاریخ محاسبه و صدور">
            <Input
              type="date"
              value={v.createForm.calculation_date}
              onChange={(e) => v.setCreateForm({ ...v.createForm, calculation_date: e.target.value })}
            />
          </Field>
        </div>
      </Dialog>

      {/* مودال ویرایش کارکرد و کسورات کارمند */}
      <Dialog
        open={!!v.editingSlip}
        onOpenChange={(open) => !open && v.closeEditSlip()}
        title={`ثبت کارکرد و کسورات: ${v.editingSlip?.employee_name || ""}`}
        description="ساعات کار، اضافه‌کاری و کسورات این ماه را وارد کنید تا فیش مجدداً محاسبه شود."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={v.closeEditSlip}>انصراف</Button>
            <Button variant="primary" busy={v.command.busy} onClick={v.handleSaveSlipTimesheet}>
              محاسبه و ذخیره
            </Button>
          </div>
        }
        className="max-w-lg"
      >
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <Field id="edit-work-days" label="روزهای کارکرد (از ۳۰ یا ۳۱)">
              <Input
                type="number"
                step="0.5"
                value={v.slipForm.work_days}
                onChange={(e) => v.setSlipForm({ ...v.slipForm, work_days: e.target.value })}
              />
            </Field>
            <Field id="edit-work-hours" label="ساعات کارکرد (پاره‌وقت/ساعتی)">
              <Input
                type="number"
                value={v.slipForm.work_hours}
                onChange={(e) => v.setSlipForm({ ...v.slipForm, work_hours: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="edit-overtime" label="ساعات اضافه‌کاری (ضریب ۱.۴)">
              <Input
                type="number"
                value={v.slipForm.overtime_hours}
                onChange={(e) => v.setSlipForm({ ...v.slipForm, overtime_hours: e.target.value })}
              />
            </Field>
            <Field id="edit-bonus" label="پاداش اختیاری (ریال)">
              <AmountInput
                value={v.slipForm.bonus_amount}
                onValueChange={(val: string) => v.setSlipForm({ ...v.slipForm, bonus_amount: val })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field id="edit-advance" label="مساعده (ریال)">
              <AmountInput
                value={v.slipForm.advance_payment}
                onValueChange={(val: string) => v.setSlipForm({ ...v.slipForm, advance_payment: val })}
              />
            </Field>
            <Field id="edit-loan" label="قسط وام (ریال)">
              <AmountInput
                value={v.slipForm.loan_installment}
                onValueChange={(val: string) => v.setSlipForm({ ...v.slipForm, loan_installment: val })}
              />
            </Field>
            <Field id="edit-other" label="سایر کسورات (ریال)">
              <AmountInput
                value={v.slipForm.other_deductions}
                onValueChange={(val: string) => v.setSlipForm({ ...v.slipForm, other_deductions: val })}
              />
            </Field>
          </div>
        </div>
      </Dialog>

      {/* مودال مشاهده فیش حقوقی کامل */}
      <Dialog
        open={!!v.viewingSlip}
        onOpenChange={(open) => !open && v.setViewingSlip(null)}
        title="فیش حقوق و دستمزد کارمند"
        description={`${v.viewingSlip?.employee_name || ""} — ${v.selectedRun?.title || ""}`}
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-xs text-muted">صادره توسط سامانه دیدبان مالی</span>
            <Button variant="secondary" onClick={() => v.setViewingSlip(null)}>بستن</Button>
          </div>
        }
        className="max-w-xl"
      >
        {v.viewingSlip && (
          <div className="space-y-4 py-2">
            {/* سربرگ مشخصات */}
            <div className="grid grid-cols-2 gap-3 rounded-panel bg-canvas p-3 text-xs">
              <div><span className="text-muted">کد پرسنلی:</span> <span className="font-mono font-medium">{v.viewingSlip.employee_code}</span></div>
              <div><span className="text-muted">نام:</span> <span className="font-medium">{v.viewingSlip.employee_name}</span></div>
              <div><span className="text-muted">سمت:</span> <span>{v.viewingSlip.job_title || "—"}</span></div>
              <div><span className="text-muted">کارکرد:</span> <span>{persian(v.viewingSlip.work_days)} روز / {persian(v.viewingSlip.overtime_hours)} ساعت اضافه‌کار</span></div>
            </div>

            {/* ریز اقلام در دو ستون: مزایا و کسورات */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* ستون مزایا */}
              <div className="rounded-panel border border-border p-3 space-y-2">
                <div className="text-xs font-semibold text-emerald-700 border-b border-border pb-1">اقلام پرداختی و مزایا</div>
                <div className="flex justify-between text-xs"><span>حقوق پایه:</span> <span>{amount(v.viewingSlip.base_pay, v.workspace.unit)}</span></div>
                <div className="flex justify-between text-xs"><span>حق مسکن:</span> <span>{amount(v.viewingSlip.housing_pay, v.workspace.unit)}</span></div>
                <div className="flex justify-between text-xs"><span>بن خواروبار:</span> <span>{amount(v.viewingSlip.grocery_pay, v.workspace.unit)}</span></div>
                <div className="flex justify-between text-xs"><span>حق تأهل:</span> <span>{amount(v.viewingSlip.marital_pay, v.workspace.unit)}</span></div>
                <div className="flex justify-between text-xs"><span>حق اولاد:</span> <span>{amount(v.viewingSlip.child_pay, v.workspace.unit)}</span></div>
                <div className="flex justify-between text-xs"><span>پایه سنوات:</span> <span>{amount(v.viewingSlip.tenure_pay, v.workspace.unit)}</span></div>
                <div className="flex justify-between text-xs"><span>اضافه‌کاری:</span> <span>{amount(v.viewingSlip.overtime_pay, v.workspace.unit)}</span></div>
                {Number(v.viewingSlip.bonus_amount) > 0 && (
                  <div className="flex justify-between text-xs"><span>پاداش:</span> <span>{amount(v.viewingSlip.bonus_amount, v.workspace.unit)}</span></div>
                )}
                <div className="flex justify-between text-xs font-bold pt-2 border-t border-border text-emerald-800">
                  <span>جمع ناخالص مزایا:</span>
                  <span>{amount(v.viewingSlip.gross_pay, v.workspace.unit)}</span>
                </div>
              </div>

              {/* ستون کسورات */}
              <div className="rounded-panel border border-border p-3 space-y-2">
                <div className="text-xs font-semibold text-rose-700 border-b border-border pb-1">کسورات قانونی و اختیاری</div>
                <div className="flex justify-between text-xs"><span>بیمه سهم کارمند (۷٪):</span> <span>{amount(v.viewingSlip.employee_insurance, v.workspace.unit)}</span></div>
                <div className="flex justify-between text-xs"><span>مالیات حقوق (ماده ۸۴):</span> <span>{amount(v.viewingSlip.payroll_tax, v.workspace.unit)}</span></div>
                {Number(v.viewingSlip.advance_payment) > 0 && (
                  <div className="flex justify-between text-xs"><span>مساعده:</span> <span>{amount(v.viewingSlip.advance_payment, v.workspace.unit)}</span></div>
                )}
                {Number(v.viewingSlip.loan_installment) > 0 && (
                  <div className="flex justify-between text-xs"><span>قسط وام:</span> <span>{amount(v.viewingSlip.loan_installment, v.workspace.unit)}</span></div>
                )}
                {Number(v.viewingSlip.other_deductions) > 0 && (
                  <div className="flex justify-between text-xs"><span>سایر کسورات:</span> <span>{amount(v.viewingSlip.other_deductions, v.workspace.unit)}</span></div>
                )}
                <div className="flex justify-between text-xs font-bold pt-2 border-t border-border text-rose-800">
                  <span>جمع کل کسورات:</span>
                  <span>{amount(v.viewingSlip.total_deductions, v.workspace.unit)}</span>
                </div>
              </div>
            </div>

            {/* بخش سهم کارفرما و خالص پرداختی */}
            <div className="flex justify-between items-center rounded-panel bg-primary-soft/60 p-4 border border-primary/20">
              <div>
                <div className="text-xs text-muted">بیمه سهم کارفرما (۲۳٪ یا ۲۰٪): {amount(v.viewingSlip.employer_insurance, v.workspace.unit)}</div>
                <div className="text-sm font-bold text-primary mt-1">خالص پرداختنی به کارمند:</div>
              </div>
              <div className="text-2xl font-bold text-primary">
                {amount(v.viewingSlip.net_pay, v.workspace.unit)}
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
