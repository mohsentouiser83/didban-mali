"use client";
import { MoneyInput } from "@/components/ui/money-input";
import { workFields, ruleFields, specialTaxKinds } from "./payroll-fields-data";
import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Field, Input, Textarea, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/dates";
import { PayrollDateField } from "./payroll-fields";
import { PayrollTaxTable } from "./payroll-tax-table";
import { Button } from "@/components/ui/button";
import type { Area, Employee, Rule, Work } from "./types";

function Choice({
  id,
  label,
  options,
  initial,
}: {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  initial?: string;
}) {
  const [value, setValue] = useState(initial ?? options[0]?.value ?? "");
  return (
    <Field id={id} label={label}>
      <Select
        id={id}
        name={id}
        value={value}
        onValueChange={setValue}
        options={options}
      />
    </Field>
  );
}
function Money({
  name,
  label,
  initial = "0",
  required = true,
}: {
  name: string;
  label: string;
  initial?: string;
  required?: boolean;
}) {
  const Control = label.includes("ریال") ? MoneyInput : Input;
  return (
    <Field id={name} label={label}>
      <Control
        id={name}
        name={name}
        inputMode="decimal"
        dir="ltr"
        defaultValue={initial}
        required={required}
        pattern="[0-9]+([.][0-9]{1,6})?"
      />
    </Field>
  );
}
export function PayrollForm({
  area,
  employees,
  rules,
  person,
  moreEmployees,
  onMoreEmployees,
  moreRules,
  onMoreRules,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  area: Area;
  employees: Employee[];
  rules: Rule[];
  person?: Employee;
  moreEmployees: boolean;
  onMoreEmployees: () => void;
  moreRules: boolean;
  onMoreRules: () => void;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const [extra, setExtra] = useState(0);
  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: e.profile.name + " · " + e.personnel_code,
  }));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        area === "employees"
          ? person
            ? "ویرایش کارمند"
            : "کارمند جدید"
          : area === "contracts"
            ? "قرارداد جدید"
            : area === "work"
              ? "ثبت کارکرد"
              : area === "rules"
                ? "قواعد حقوق"
                : "محاسبه حقوق"
      }
      busy={busy}
    >
      <Form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {area === "employees" ? (
            <>
              <Field id="personnel_code" label="کد پرسنلی">
                <Input
                  id="personnel_code"
                  name="personnel_code"
                  defaultValue={person?.personnel_code}
                  required
                  dir="ltr"
                  maxLength={64}
                />
              </Field>
              <Field id="name" label="نام و نام خانوادگی">
                <Input
                  id="name"
                  name="name"
                  defaultValue={person?.profile.name}
                  required
                  maxLength={250}
                />
              </Field>
              {[
                "national_id",
                "insurance_number",
                "iban",
                "department",
                "position",
              ].map((key) => (
                <Field
                  key={key}
                  id={key}
                  label={
                    {
                      national_id: "کد ملی",
                      insurance_number: "شماره بیمه",
                      iban: "شبا",
                      department: "واحد",
                      position: "سمت",
                    }[key] ?? key
                  }
                >
                  <Input
                    id={key}
                    name={key}
                    defaultValue={person?.profile[key]}
                    dir={
                      ["department", "position"].includes(key) ? "rtl" : "ltr"
                    }
                    maxLength={250}
                  />
                </Field>
              ))}
              <PayrollDateField
                id="hired_on"
                name="hired_on"
                label="تاریخ استخدام"
                initialValue={person?.profile.hired_on}
                required
              />
              <PayrollDateField
                id="ended_on"
                name="ended_on"
                label="پایان همکاری"
                initialValue={person?.profile.ended_on}
              />
              <PayrollDateField
                id="opening_as_of"
                name="opening_as_of"
                label="تاریخ مانده شروع"
                initialValue={person?.profile.opening_as_of}
              />
              {Object.entries({
                opening_leave_days: "مرخصی شروع — روز",
                opening_loan: "وام شروع — ریال",
                opening_advance: "مساعده شروع — ریال",
                opening_unpaid_wages: "حقوق پرداخت‌نشده شروع — ریال",
              }).map(([key, label]) => (
                <Money
                  key={key}
                  name={key}
                  label={label}
                  initial={person?.profile[key] ?? "0"}
                />
              ))}
              <Field id="opening_source" label="مرجع مانده شروع">
                <Input
                  id="opening_source"
                  name="opening_source"
                  defaultValue={person?.profile.opening_source}
                />
              </Field>
            </>
          ) : null}
          {area === "contracts" || area === "work" ? (
            <Choice id="employee_id" label="کارمند" options={employeeOptions} />
          ) : null}
          {area === "contracts" ? (
            <>
              <Choice
                id="employment_type"
                label="نوع همکاری"
                options={[
                  { value: "full_time", label: "تمام‌وقت" },
                  { value: "part_time", label: "پاره‌وقت" },
                ]}
              />
              <Choice
                id="pay_basis"
                label="مبنای مزد"
                options={[
                  { value: "monthly", label: "ماهانه" },
                  { value: "daily", label: "روزانه" },
                  { value: "hourly", label: "ساعتی" },
                ]}
              />
              <Money name="base_amount" label="مزد مبنا — ریال" initial="" />
              <Money
                name="hours_per_day"
                label="ساعت موظف روزانه؛ برای پاره‌وقت لازم است"
                initial=""
                required={false}
              />
              <PayrollDateField
                id="effective_from"
                name="effective_from"
                label="شروع اعتبار"
                required
              />
              <PayrollDateField
                id="effective_to"
                name="effective_to"
                label="پایان اعتبار"
              />
            </>
          ) : null}
          {area === "work" || area === "runs" ? (
            <>
              <PayrollDateField
                id="period_start"
                name="period_start"
                label="از تاریخ"
                required
              />
              <PayrollDateField
                id="period_end"
                name="period_end"
                label="تا تاریخ"
                required
              />
            </>
          ) : null}
          {area === "work" ? (
            <>
              {Object.entries(workFields).map(([key, label]) => (
                <Money
                  key={key}
                  name={key}
                  label={label}
                  initial={
                    [
                      "period_days",
                      "tax_elapsed_months",
                      "leave_accrued_days",
                    ].includes(key)
                      ? ""
                      : "0"
                  }
                  required={key !== "leave_accrued_days"}
                />
              ))}
              <Choice
                id="shift_code"
                label="نوبت‌کاری"
                options={[
                  { value: "none", label: "بدون نوبت‌کاری" },
                  { value: "morning_evening", label: "صبح و عصر" },
                  { value: "three_shift", label: "سه‌نوبت" },
                  { value: "night_rotation", label: "گردش شب" },
                ]}
              />
              <Field id="prior_paid_reference" label="مرجع پرداخت مزایای قبلی">
                <Input id="prior_paid_reference" name="prior_paid_reference" />
              </Field>
              <Field id="correction_reference" label="مرجع اصلاح حقوق قبل">
                <Input id="correction_reference" name="correction_reference" />
              </Field>
              <Field id="unpaid_wages_reference" label="مرجع حقوق پرداخت‌نشده">
                <Input
                  id="unpaid_wages_reference"
                  name="unpaid_wages_reference"
                />
              </Field>
              <Checkbox
                id="unpaid_wages_already_processed"
                name="unpaid_wages_already_processed"
                label="حقوق پرداخت‌نشده قبلاً محاسبه شده است"
              />
              {Object.entries(specialTaxKinds).map(([kind, label]) => (
                <Checkbox
                  key={kind}
                  id={kind + "_tax_history_complete"}
                  name={kind + "_tax_history_complete"}
                  label={`سابقه مالیاتی ${label} کامل است`}
                />
              ))}
              <Checkbox
                id="tax_history_complete"
                name="tax_history_complete"
                label="سابقه مالیاتی واردشده کامل است"
              />
            </>
          ) : null}
          {area === "rules" ? (
            <>
              <Field id="name" label="نام مجموعه قواعد">
                <Input id="name" name="name" required />
              </Field>
              <PayrollDateField
                id="effective_from"
                name="effective_from"
                label="شروع اعتبار"
                required
              />
              <PayrollDateField
                id="effective_to"
                name="effective_to"
                label="پایان اعتبار"
                required
              />
              {Object.entries(ruleFields)
                .filter(([key]) => key !== "tax_exemption_monthly")
                .map(([key, label]) => (
                  <Money key={key} name={key} label={label} initial="" />
                ))}
              <Choice
                id="tax_mode"
                label="روش مالیات"
                options={[
                  { value: "cumulative", label: "تجمعی" },
                  { value: "monthly", label: "ماهانه" },
                ]}
              />
              <Money
                name="shift_morning_evening"
                label="نرخ نوبت صبح و عصر"
                initial=""
              />
              <Money name="shift_three_shift" label="نرخ سه‌نوبت" initial="" />
              <Money
                name="shift_night_rotation"
                label="نرخ گردش شب"
                initial=""
              />
            </>
          ) : null}
          {area === "runs" ? (
            <>
              <Choice
                id="rule_id"
                label="قواعد بازبینی‌شده"
                options={rules
                  .filter((r) => r.reviewed)
                  .map((r) => ({ value: r.id, label: r.name }))}
              />
              <Choice
                id="kind"
                label="نوع محاسبه"
                options={[
                  { value: "monthly", label: "حقوق دوره" },
                  { value: "eidi", label: "عیدی" },
                  { value: "sanavat", label: "سنوات" },
                  { value: "termination", label: "تسویه پایان همکاری" },
                  { value: "arrears", label: "معوقات" },
                ]}
              />
              <Field id="supersedes_id" label="شناسه نسخه قبلی برای اصلاح">
                <Input id="supersedes_id" name="supersedes_id" dir="ltr" />
              </Field>
            </>
          ) : null}
        </div>
        {area === "contracts" ? (
          <section className="space-y-3">
            <h3 className="font-medium">اجزای مزایا</h3>
            {Array.from({ length: extra }, (_, i) => (
              <div
                key={i}
                className="grid gap-3 rounded-control border border-border p-3 sm:grid-cols-2"
              >
                <Field id={`component_key_${i}`} label="عنوان مزایا">
                  <Input
                    id={`component_key_${i}`}
                    name={`component_key_${i}`}
                    required
                  />
                </Field>
                <Money
                  name={`component_amount_${i}`}
                  label="مبلغ — ریال"
                  initial=""
                />
                <Checkbox
                  id={`component_taxable_${i}`}
                  name={`component_taxable_${i}`}
                  label="مشمول مالیات"
                />
                <Checkbox
                  id={`component_insurable_${i}`}
                  name={`component_insurable_${i}`}
                  label="مشمول بیمه"
                />
                <Checkbox
                  id={`component_prorate_${i}`}
                  name={`component_prorate_${i}`}
                  label="متناسب با کارکرد"
                  defaultChecked
                />
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={() => setExtra(extra + 1)}
              disabled={extra >= 30}
            >
              افزودن مزایا
            </Button>
          </section>
        ) : null}
        {area === "rules" ? (
          <>
            <Field id="source_urls" label="نشانی منابع رسمی؛ هر نشانی در یک خط">
              <Textarea
                id="source_urls"
                name="source_urls"
                required
                dir="ltr"
                rows={3}
              />
            </Field>
            <PayrollTaxTable />
            <section className="space-y-3">
              <h3 className="font-medium">شمول مزایا</h3>
              {[
                ["monthly", "حقوق دوره"],
                ["eidi", "عیدی"],
                ["sanavat", "سنوات"],
                ["termination", "تسویه"],
                ["arrears", "معوقات"],
              ].map(([key, label]) => (
                <div key={key} className="flex flex-wrap items-center gap-4">
                  <span>{label}</span>
                  <Checkbox
                    id={`${key}_taxable`}
                    name={`${key}_taxable`}
                    label="مالیات"
                  />
                  <Checkbox
                    id={`${key}_insurable`}
                    name={`${key}_insurable`}
                    label="بیمه"
                  />
                </div>
              ))}
            </section>
          </>
        ) : null}
        {area === "runs" ? (
          <section className="space-y-3">
            <h3 className="font-medium">کارکنان این محاسبه</h3>
            {employees.map((e) => (
              <Checkbox
                key={e.id}
                id={`run-${e.id}`}
                name="employee_ids"
                value={e.id}
                label={e.profile.name}
              />
            ))}
          </section>
        ) : null}
        {area !== "employees" && moreEmployees ? (
          <Button variant="ghost" onClick={onMoreEmployees}>
            کارکنان بیشتر
          </Button>
        ) : null}
        {area === "runs" && moreRules ? (
          <Button variant="ghost" onClick={onMoreRules}>
            قواعد بیشتر
          </Button>
        ) : null}
        <FormMessage>{error}</FormMessage>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            انصراف
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "در حال ثبت…" : area === "runs" ? "محاسبه" : "ثبت"}
          </Button>
        </div>
      </Form>
    </Dialog>
  );
}

export function RuleReviewForm({
  rule,
  contractOptions,
  moreSamples,
  onMoreSamples,
  work,
  employeeNames,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  rule: Rule;
  contractOptions: { value: string; label: string }[];
  moreSamples: boolean;
  onMoreSamples: () => void;
  work: Work[];
  employeeNames: Record<string, string>;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="بازبینی قواعد با نمونه مرجع"
      busy={busy}
    >
      <Form onSubmit={onSubmit} className="space-y-4">
        <Field id="reference" label="مرجع بررسی متخصص">
          <Input id="reference" name="reference" required />
        </Field>
        <Choice
          id="contract_id"
          label="قرارداد نمونه"
          options={contractOptions}
        />
        <Choice
          id="work_id"
          label="کارکرد نمونه"
          options={work.map((w) => ({
            value: w.id,
            label:
              (employeeNames[w.employee_id] ?? "کارمند") +
              " · " +
              formatDate(w.period_start) +
              " تا " +
              formatDate(w.period_end),
          }))}
        />
        {moreSamples ? (
          <Button variant="ghost" onClick={onMoreSamples}>
            نمونه‌های بیشتر
          </Button>
        ) : null}
        <Money name="expected_gross" label="ناخالص مرجع — ریال" initial="" />
        <Money name="expected_net" label="خالص مرجع — ریال" initial="" />
        <FormMessage>{error}</FormMessage>
        <Button type="submit" disabled={busy}>
          {busy ? "در حال بررسی…" : "ثبت بررسی " + rule.name}
        </Button>
      </Form>
    </Dialog>
  );
}
