"use client";

import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { UsersThreeIcon, PlusIcon, PencilSimpleIcon, TrashIcon, ShieldCheckIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { useEmployees } from "@/hooks/use-employees";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableRowHeader, TableCell, TableEmptyCell } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function EmployeesManagementView() {
  const v = useEmployees();
  if (!v.workspace.company) return <NoCompany />;

  return (
    <>
      <PageHeader
        title="کارمندان"
        icon={UsersThreeIcon}
        action={v.canPrepare && (
          <Button variant="primary" onClick={v.openAdd}>
            <PlusIcon size={18} aria-hidden />
            افزودن کارمند جدید
          </Button>
        )}
      />

      {v.loading ? (
        <LoadingState label="در حال دریافت کارمندان..." />
      ) : v.error ? (
        <ErrorState message={v.error.message} onRetry={v.error.status === 403 ? undefined : v.refresh} />
      ) : (
        <div className="space-y-5">
          <Panel title="فهرست پرسنل">
            <Table title="فهرست کارمندان" onImport={v.canPrepare ? v.importFromExcel : undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead>کد پرسنلی</TableHead>
                  <TableHead>نام و نام خانوادگی</TableHead>
                  <TableHead>عنوان شغلی / واحد</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="text-end">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {v.employees.length ? (
                  v.employees.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableRowHeader>
                        <span dir="ltr" className="tabular-nums">{emp.employee_code}</span>
                      </TableRowHeader>
                      <TableCell className="font-medium">{emp.full_name}</TableCell>
                      <TableCell>{emp.job_title || emp.department || "—"}</TableCell>
                      <TableCell>
                        {emp.active ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircleIcon size={14} weight="fill" /> فعال
                          </span>
                        ) : (
                          <span className="text-xs text-muted">غیرفعال</span>
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        <TableRowActions label={`عملیات ${emp.full_name}`}>
                          <TableRowAction
                            onClick={() => v.openEdit(emp)}
                            title="ویرایش"
                            icon={<PencilSimpleIcon size={16} />}
                          >
                            ویرایش
                          </TableRowAction>
                          <TableRowAction
                            onClick={() => v.requestRemove(emp)}
                            aria-label={`حذف یا غیرفعال‌سازی ${emp.full_name}`}
                            icon={<TrashIcon size={16} />}
                            danger
                          >
                            حذف
                          </TableRowAction>
                        </TableRowActions>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell
                    colSpan={5}
                    title="کارمندی یافت نشد"
                    action={
                      v.canPrepare ? (
                        <Button variant="secondary" onClick={v.openAdd}>
                          افزودن اولین کارمند
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </TableBody>
            </Table>
          </Panel>
        </div>
      )}

      {/* Add / Edit Employee Drawer */}
      <Drawer
        open={v.canPrepare && v.formOpen}
        onOpenChange={(open) => !open && v.closeForm()}
        title={v.editing ? "ویرایش مشخصات کارمند" : "ثبت کارمند جدید"}
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={v.closeForm}>انصراف</Button>
            <Button variant="primary" busy={v.command.busy} className="w-full" onClick={v.save}>
              {v.editing ? "ذخیره تغییرات" : "ثبت کارمند"}
            </Button>
          </div>
        }
        className="max-w-2xl"
      >
        <div className="space-y-6 py-2">
          {/* بخش ۱: اطلاعات هویتی و پرسنلی */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-muted">۱. مشخصات هویتی و سازمانی</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              
              <Field id="emp-first-name" label="نام" required>
                <Input
                  value={v.form.first_name}
                  onChange={(e) => v.setForm({ ...v.form, first_name: e.target.value })}
                  placeholder="نام"
                />
              </Field>
              <Field id="emp-last-name" label="نام خانوادگی" required>
                <Input
                  value={v.form.last_name}
                  onChange={(e) => v.setForm({ ...v.form, last_name: e.target.value })}
                  placeholder="نام خانوادگی"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field id="emp-identity-type" label="نوع هویت">
                <Select
                  value={v.form.identity_type || "national_id"}
                  onValueChange={(val) => v.setForm({ ...v.form, identity_type: val as "national_id" | "foreign_national_id" })}
                  options={[
                    { value: "national_id", label: "کد ملی (ایرانی)" },
                    { value: "foreign_national_id", label: "کد فراگیر اتباع (غیر ایرانی)" },
                  ]}
                />
              </Field>
              <Field id="emp-national-id" label="کد ملی / شناسه فراگیر">
                <Input
                  value={v.form.national_id || ""}
                  onChange={(e) => v.setForm({ ...v.form, national_id: e.target.value })}
                  placeholder="۱۰ رقم یا شناسه اتباع"
                />
              </Field>
              <Field id="emp-insurance" label="شماره بیمه تأمین اجتماعی">
                <Input
                  value={v.form.insurance_number || ""}
                  onChange={(e) => v.setForm({ ...v.form, insurance_number: e.target.value })}
                  placeholder="شماره بیمه"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field id="emp-marital" label="وضعیت تأهل">
                <Select
                  value={v.form.marital_status || "single"}
                  onValueChange={(val) => v.setForm({ ...v.form, marital_status: val as "single" | "married" })}
                  options={[
                    { value: "single", label: "مجرد" },
                    { value: "married", label: "متأهل (مشمول حق تأهل)" },
                  ]}
                />
              </Field>
              <Field id="emp-children" label="تعداد فرزندان مشمول حق اولاد">
                <Input
                  type="number"
                  min="0"
                  max="20"
                  value={String(v.form.children_count || 0)}
                  onChange={(e) => v.setForm({ ...v.form, children_count: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field id="emp-job" label="عنوان شغل / سمت">
                <Input
                  value={v.form.job_title || ""}
                  onChange={(e) => v.setForm({ ...v.form, job_title: e.target.value })}
                />
              </Field>
            </div>
          </div>

          {/* بخش ۲: اطلاعات بانکی */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-muted">۲. اطلاعات واریز بانکی</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field id="emp-iban" label="شماره شبا">
                <Input
                  dir="ltr"
                  value={v.form.iban || ""}
                  onChange={(e) => v.setForm({ ...v.form, iban: e.target.value })}
                  placeholder="IR..."
                />
              </Field>
              <Field id="emp-bank" label="نام بانک">
                <Input
                  value={v.form.bank_name || ""}
                  onChange={(e) => v.setForm({ ...v.form, bank_name: e.target.value })}
                />
              </Field>
              <Field id="emp-account" label="شماره حساب">
                <Input
                  dir="ltr"
                  value={v.form.account_number || ""}
                  onChange={(e) => v.setForm({ ...v.form, account_number: e.target.value })}
                  placeholder="شماره حساب"
                />
              </Field>
            </div>
          </div>

          {/* بخش ۳: شرایط خاص و معافیت‌های قانونی */}
          <div className="space-y-3 rounded-panel border border-border p-4 bg-canvas/50">
            <div className="flex items-center gap-2 text-primary font-medium text-sm">
              <ShieldCheckIcon size={18} />
              <span>شرایط خاص و معافیت‌های قانونی (شورای عالی کار و مالیات)</span>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <Checkbox
                  checked={v.form.is_veteran_or_child || false}
                  onCheckedChange={(checked) => v.setForm({ ...v.form, is_veteran_or_child: !!checked })}
                  label="ایثارگر، جانباز یا فرزند شاهد و جانباز (ماده ۵۶ قانون جامع ایثارگران)"
                />
              </div>

              <div>
                <Checkbox
                  checked={v.form.is_foreign_national || false}
                  onCheckedChange={(checked) => v.setForm({ ...v.form, is_foreign_national: !!checked })}
                  label="تبعه خارجی دارای پروانه کار (حذف ۳٪ بیمه بیکاری)"
                />
              </div>

              <div>
                <Checkbox
                  checked={v.form.is_science_park_staff || false}
                  onCheckedChange={(checked) => v.setForm({ ...v.form, is_science_park_staff: !!checked })}
                  label="شاغل در شرکت دانش‌بنیان / پارک علم و فناوری (بند چ ماده ۸ قانون جهش تولید)"
                />
              </div>

              <div>
                <Checkbox
                  checked={v.form.has_disability_charge || false}
                  onCheckedChange={(checked) => v.setForm({ ...v.form, has_disability_charge: !!checked })}
                  label="سرپرست / ولیّ فرد دارای معلولیت شدید (ماده ۲۵ قانون حمایت از حقوق معلولان)"
                />
              </div>

              <div>
                <Checkbox
                  checked={v.form.is_underdeveloped_region || false}
                  onCheckedChange={(checked) => v.setForm({ ...v.form, is_underdeveloped_region: !!checked })}
                  label="شاغل در مناطق محروم و کمتر توسعه‌یافته (ماده ۹۲ ق.م.م)"
                />
              </div>

              <div>
                <Checkbox
                  checked={v.form.is_retired || false}
                  onCheckedChange={(checked) => v.setForm({ ...v.form, is_retired: !!checked })}
                  label="بازنشسته شاغل"
                />
              </div>
            </div>
          </div>
        </div>
      </Drawer>
      <ConfirmDialog
        open={v.canPrepare && !!v.deleting}
        onOpenChange={(open) => { if (!open) v.cancelRemove(); }}
        title="حذف یا غیرفعال‌سازی کارمند"
        busy={v.command.busy}
        onConfirm={v.remove}
      >
        <p>«{v.deleting?.full_name}» حذف می‌شود. در صورت وجود قرارداد یا فیش، پرونده غیرفعال می‌شود.</p>
        <FormMessage error>{v.command.error?.message}</FormMessage>
      </ConfirmDialog>
    </>
  );
}
