"use client";

import { BooksIcon, PlusIcon, PencilSimpleIcon, ArrowClockwiseIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { useContracts } from "@/hooks/use-contracts";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { SearchInput } from "@/components/ui/search-input";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableRowHeader, TableCell, TableEmptyCell } from "@/components/ui/table";
import { Drawer } from "@/components/ui/drawer";
import { Field } from "@/components/ui/field";
import { Input, AmountInput } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { amount, displayDate, persian } from "@/lib/utils";

const contractTypeLabels: Record<string, string> = {
  full_time: "تمام‌وقت (قانون کار)",
  part_time: "پاره‌وقت (ماده ۳۹)",
  hourly: "ساعتی",
  project: "پروژه‌ای / مشاوره‌ای",
};

export function ContractsManagementView() {
  const v = useContracts();
  if (!v.workspace.company) return <NoCompany />;

  return (
    <>
      <PageHeader
        title="قرارداد کارمندان"
        icon={BooksIcon}
        action={
          <Button variant="primary" onClick={v.openAdd}>
            <PlusIcon size={18} aria-hidden />
            ثبت قرارداد جدید
          </Button>
        }
      />

      {v.loading ? (
        <LoadingState label="در حال بارگذاری قراردادها..." />
      ) : v.error ? (
        <ErrorState message={v.error.message} onRetry={v.refresh} />
      ) : (
        <div className="space-y-5">
          <Panel title="فهرست قراردادهای کارمندان">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <SearchInput
                label="جستجوی شماره قرارداد یا نام کارمند"
                value={v.search}
                onChange={(e) => v.setSearch(e.target.value)}
                className="min-w-0 flex-1"
              />
              <div className="w-56">
                <Select
                  value={v.filterEmployeeId}
                  onValueChange={v.setFilterEmployeeId}
                  options={[
                    { value: "all", label: "همه کارمندان" },
                    ...v.employees.map((e) => ({
                      value: e.id,
                      label: `${e.full_name} (${e.employee_code})`,
                    })),
                  ]}
                />
              </div>
              {v.search && (
                <Button variant="ghost" onClick={() => v.setSearch("")}>
                  <ArrowClockwiseIcon size={18} aria-hidden />
                  پاک‌کردن
                </Button>
              )}
              <span className="text-xs text-muted">{persian(v.contracts.length)} قرارداد</span>
            </div>

            <Table title="قراردادهای کارمندان" onImport={v.importFromExcel}>
              <TableHeader>
                <TableRow>
                  <TableHead>شماره قرارداد</TableHead>
                  <TableHead>کارمند</TableHead>
                  <TableHead>نوع قرارداد</TableHead>
                  <TableHead>تاریخ شروع</TableHead>
                  <TableHead>تاریخ پایان</TableHead>
                  <TableHead>حقوق پایه ({v.workspace.unit === "IRR" ? "ریال" : "تومان"})</TableHead>
                  <TableHead>بن و مسکن</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="text-end">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {v.contracts.length ? (
                  v.contracts.map((con) => (
                    <TableRow key={con.id}>
                      <TableRowHeader>
                        <span dir="ltr" className="font-mono">{con.contract_number}</span>
                      </TableRowHeader>
                      <TableCell className="font-medium">
                        {con.employee_name} <span className="text-xs text-muted">({con.employee_code})</span>
                      </TableCell>
                      <TableCell>{contractTypeLabels[con.contract_type] || con.contract_type}</TableCell>
                      <TableCell>{displayDate(con.start_date)}</TableCell>
                      <TableCell>{con.end_date ? displayDate(con.end_date) : "نامحدود"}</TableCell>
                      <TableCell className="font-medium">
                        {amount(con.base_salary, v.workspace.unit)}
                      </TableCell>
                      <TableCell>
                        {amount(
                          String(BigInt(con.housing_allowance || 0) + BigInt(con.grocery_allowance || 0)),
                          v.workspace.unit,
                        )}
                      </TableCell>
                      <TableCell>
                        {con.status === "active" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircleIcon size={14} weight="fill" /> فعال
                          </span>
                        ) : con.status === "terminated" ? (
                          <span className="text-xs text-rose-600">خاتمه‌یافته</span>
                        ) : (
                          <span className="text-xs text-amber-600">پیش‌نویس</span>
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button variant="ghost" className="size-8 p-0" onClick={() => v.openEdit(con)} title="ویرایش">
                          <PencilSimpleIcon size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell
                    colSpan={9}
                    title="قراردادی ثبت نشده است"
                    action={
                      <Button variant="secondary" onClick={v.openAdd}>
                        ثبت اولین قرارداد
                      </Button>
                    }
                  />
                )}
              </TableBody>
            </Table>
          </Panel>
        </div>
      )}

      {/* Add / Edit Contract Drawer */}
      <Drawer
        open={v.formOpen}
        onOpenChange={(open) => !open && v.closeForm()}
        title={v.editing ? "ویرایش قرارداد" : "ثبت قرارداد جدید"}
        description="شرایط همکاری، نوع قرارداد و مبالغ ثابت ماهانه یا ساعتی را مشخص کنید."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={v.closeForm}>انصراف</Button>
            <Button variant="primary" busy={v.command.busy} onClick={v.save}>
              {v.editing ? "ذخیره تغییرات" : "ثبت قرارداد"}
            </Button>
          </div>
        }
        className="max-w-2xl"
      >
        <div className="space-y-6 py-2">
          {/* مشخصات پایه قرارداد */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-muted">۱. مشخصات و طرف قرارداد</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id="con-emp" label="کارمند *">
                <Select
                  value={v.form.employee_id}
                  onValueChange={(val) => v.setForm({ ...v.form, employee_id: val })}
                  options={v.employees.map((e) => ({
                    value: e.id,
                    label: `${e.full_name} (${e.employee_code})`,
                  }))}
                  disabled={!!v.editing}
                />
              </Field>
              <Field id="con-number" label="شماره قرارداد *">
                <Input
                  value={v.form.contract_number}
                  onChange={(e) => v.setForm({ ...v.form, contract_number: e.target.value })}
                  placeholder="مثال: CON-1403-01"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field id="con-type" label="نوع قرارداد *">
                <Select
                  value={v.form.contract_type || "full_time"}
                  onValueChange={(val) => v.setForm({ ...v.form, contract_type: val as "full_time" | "part_time" | "hourly" | "project" })}
                  options={[
                    { value: "full_time", label: "تمام‌وقت (مبنای قانون کار)" },
                    { value: "part_time", label: "پاره‌وقت (ماده ۳۹ نسبت به ساعت)" },
                    { value: "hourly", label: "ساعتی" },
                    { value: "project", label: "پروژه‌ای / مشاوره‌ای" },
                  ]}
                />
              </Field>
              <Field id="con-start" label="تاریخ شروع قرارداد *">
                <Input
                  type="date"
                  value={String(v.form.start_date || "")}
                  onChange={(e) => v.setForm({ ...v.form, start_date: e.target.value })}
                />
              </Field>
              <Field id="con-end" label="تاریخ پایان قرارداد">
                <Input
                  type="date"
                  value={String(v.form.end_date || "")}
                  onChange={(e) => v.setForm({ ...v.form, end_date: e.target.value || null })}
                />
              </Field>
            </div>
          </div>

          {/* اقلام حقوق و مزایا */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-muted">۲. اقلام حقوق پایه و مزایای قانونی (به ریال)</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id="con-base" label="حقوق پایه ماهانه *">
                <AmountInput
                  value={String(v.form.base_salary || "0")}
                  onValueChange={(val: string) => v.setForm({ ...v.form, base_salary: val })}
                />
              </Field>
              <Field id="con-daily" label="دستمزد روزانه یا ساعتی">
                <AmountInput
                  value={String(v.form.daily_rate || "0")}
                  onValueChange={(val: string) => v.setForm({ ...v.form, daily_rate: val })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id="con-housing" label="کمک‌هزینه مسکن">
                <AmountInput
                  value={String(v.form.housing_allowance || "9000000")}
                  onValueChange={(val: string) => v.setForm({ ...v.form, housing_allowance: val })}
                />
              </Field>
              <Field id="con-grocery" label="بن خواروبار (اقلام مصرفی)">
                <AmountInput
                  value={String(v.form.grocery_allowance || "14000000")}
                  onValueChange={(val: string) => v.setForm({ ...v.form, grocery_allowance: val })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field id="con-marital" label="حق تأهل ماهانه">
                <AmountInput
                  value={String(v.form.marital_allowance || "0")}
                  onValueChange={(val: string) => v.setForm({ ...v.form, marital_allowance: val })}
                />
              </Field>
              <Field id="con-child" label="حق اولاد توافقی (خالی = مصوب قانونی)">
                <AmountInput
                  value={String(v.form.child_allowance || "0")}
                  onValueChange={(val: string) => v.setForm({ ...v.form, child_allowance: val })}
                />
              </Field>
              <Field id="con-tenure" label="پایه سنوات ماهانه">
                <AmountInput
                  value={String(v.form.tenure_allowance || "0")}
                  onValueChange={(val: string) => v.setForm({ ...v.form, tenure_allowance: val })}
                />
              </Field>
            </div>
          </div>

          {/* شمولیت بیمه و مالیات */}
          <div className="space-y-3 rounded-panel border border-border p-4 bg-canvas/50">
            <h4 className="text-xs font-semibold text-muted">۳. قواعد شمولیت</h4>
            <div className="flex flex-wrap gap-6 pt-1">
              <div className="space-y-1">
                <Checkbox
                  checked={v.form.is_insured ?? true}
                  onCheckedChange={(checked) => v.setForm({ ...v.form, is_insured: !!checked })}
                  label="مشمول بیمه تأمین اجتماعی"
                />
                <p className="text-xs text-muted ps-7">حق بیمه سهم کارمند و کارفرما محاسبه می‌شود.</p>
              </div>
              <div className="space-y-1">
                <Checkbox
                  checked={v.form.is_taxable ?? true}
                  onCheckedChange={(checked) => v.setForm({ ...v.form, is_taxable: !!checked })}
                  label="مشمول مالیات بر درآمد حقوق"
                />
                <p className="text-xs text-muted ps-7">مالیات بر اساس جدول پلکانی ماده ۸۴ محاسبه می‌گردد.</p>
              </div>
            </div>
          </div>
        </div>
      </Drawer>
    </>
  );
}
