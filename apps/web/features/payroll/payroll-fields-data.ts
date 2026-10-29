export const workFields: Record<string, string> = {
  worked_days: "روز استحقاق مزد و بیمه",
  worked_hours: "ساعت کارکرد",
  period_days: "روزهای بازه",
  overtime_hours: "ساعت اضافه‌کاری",
  night_hours: "ساعت شب‌کاری غیرنوبتی",
  holiday_hours: "ساعت تعطیل‌کاری",
  deductions: "سایر کسورات — ریال",
  loan_installment: "قسط وام — ریال",
  advance_offset: "کسر مساعده — ریال",
  leave_accrued_days: "مرخصی استحقاقی دوره — روز",
  leave_used_days: "مرخصی مصرف‌شده — روز",
  leave_cashout_days: "مرخصی قابل تسویه — روز",
  service_days: "روزهای خدمت برای مزایا",
  prior_paid_special: "مزایای قبلاً پرداخت‌شده — ریال",
  unpaid_wages: "حقوق پرداخت‌نشده — ریال",
  arrears_amount: "معوقات این محاسبه — ریال",
  prior_taxable: "مشمول مالیات قبلی — ریال",
  prior_tax_paid: "مالیات قبلی — ریال",
  tax_elapsed_months: "تعداد ماه مالیاتی",
};
export const specialTaxKinds = {
  eidi: "عیدی",
  sanavat: "سنوات",
  termination: "تسویه",
  arrears: "معوقات",
};
for (const [kind, label] of Object.entries(specialTaxKinds)) {
  workFields[kind + "_prior_taxable"] = `مشمول مالیات قبلی ${label} — ریال`;
  workFields[kind + "_prior_tax_paid"] = `مالیات قبلی ${label} — ریال`;
  workFields[kind + "_tax_elapsed_months"] = `ماه مالیاتی ${label}`;
}
export const ruleFields: Record<string, string> = {
  rounding_unit: "واحد گردکردن — ریال",
  monthly_reference_days: "مقسوم‌علیه مزد ماهانه — روز",
  hours_per_day: "ساعات مبنای روز",
  overtime_multiplier: "ضریب اضافه‌کاری",
  night_premium: "نرخ فوق‌العاده شب‌کاری",
  holiday_multiplier: "ضریب تعطیل‌کاری",
  employee_insurance_rate: "نرخ بیمه سهم کارمند",
  employer_insurance_rate: "نرخ بیمه سهم کارفرما",
  insurance_daily_floor: "کف روزانه بیمه — ریال",
  insurance_daily_cap: "سقف روزانه بیمه — ریال",
  tax_exemption_monthly: "معافیت ماهانه مالیات — ریال",
  eidi_wage_days: "روز مزد مبنای عیدی",
  eidi_cap_daily_wage: "مزد روزانه سقف عیدی — ریال",
  sanavat_wage_days: "روز مزد مبنای سنوات",
  year_days: "روزهای سال مبنا",
  annual_leave_days: "مرخصی استحقاقی سال — روز",
};
