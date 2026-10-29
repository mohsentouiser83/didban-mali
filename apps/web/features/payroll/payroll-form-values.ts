import type { Area } from "./types";
import { workFields, ruleFields, specialTaxKinds } from "./payroll-fields-data";
export const value = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();
export function createBody(area: Area, data: FormData): unknown {
  if (area === "employees") {
    const profile: Record<string, string> = {};
    for (const key of [
      "name",
      "national_id",
      "insurance_number",
      "iban",
      "department",
      "position",
      "hired_on",
      "ended_on",
      "opening_as_of",
      "opening_source",
      "opening_leave_days",
      "opening_loan",
      "opening_advance",
      "opening_unpaid_wages",
    ]) {
      const v = value(data, key);
      if (v) profile[key] = v;
    }
    return { personnel_code: value(data, "personnel_code"), profile };
  }
  if (area === "contracts") {
    const components = [];
    for (let i = 0; data.has(`component_key_${i}`); i++)
      components.push({
        key: value(data, `component_key_${i}`),
        amount: value(data, `component_amount_${i}`),
        taxable: data.has(`component_taxable_${i}`),
        insurable: data.has(`component_insurable_${i}`),
        prorate: data.has(`component_prorate_${i}`),
      });
    return {
      employee_id: value(data, "employee_id"),
      effective_from: value(data, "effective_from"),
      effective_to: value(data, "effective_to") || null,
      content: {
        employment_type: value(data, "employment_type"),
        pay_basis: value(data, "pay_basis"),
        base_amount: value(data, "base_amount"),
        ...(value(data, "hours_per_day")
          ? { hours_per_day: value(data, "hours_per_day") }
          : {}),
        components,
      },
    };
  }
  if (area === "work") {
    const content: Record<string, unknown> = {};
    for (const key of Object.keys(workFields)) {
      if (key === "leave_accrued_days" && !value(data, key)) continue;
      content[key] = value(data, key) || "0";
    }
    content.shift_code = value(data, "shift_code");
    content.tax_history_complete = data.has("tax_history_complete");
    for (const kind of Object.keys(specialTaxKinds))
      content[kind + "_tax_history_complete"] = data.has(
        kind + "_tax_history_complete",
      );
    content.unpaid_wages_already_processed = data.has(
      "unpaid_wages_already_processed",
    );
    content.unpaid_wages_reference = value(data, "unpaid_wages_reference");
    for (const key of ["prior_paid_reference", "correction_reference"])
      content[key] = value(data, key);
    return {
      employee_id: value(data, "employee_id"),
      period_start: value(data, "period_start"),
      period_end: value(data, "period_end"),
      content,
    };
  }
  if (area === "rules") {
    const content: Record<string, unknown> = {};
    for (const key of Object.keys(ruleFields)) content[key] = value(data, key);
    content.tax_mode = value(data, "tax_mode");
    content.source_urls = [
      ...new Set(
        [
          ...value(data, "source_urls").split(/\r?\n/),
          value(data, "tax_table_source_url"),
        ]
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    content.shift_rates = {
      none: "0",
      morning_evening: value(data, "shift_morning_evening"),
      three_shift: value(data, "shift_three_shift"),
      night_rotation: value(data, "shift_night_rotation"),
    };
    content.special_treatment = Object.fromEntries(
      ["monthly", "eidi", "sanavat", "termination", "arrears"].map((k) => [
        k,
        {
          taxable: data.has(`${k}_taxable`),
          insurable: data.has(`${k}_insurable`),
        },
      ]),
    );
    const bands = [];
    for (let i = 0; data.has(`band_rate_${i}`); i++)
      bands.push({
        up_to: value(data, `band_upper_${i}`) || null,
        rate: value(data, `band_rate_${i}`),
      });
    content.tax_bands = bands;
    return {
      name: value(data, "name"),
      effective_from: value(data, "effective_from"),
      effective_to: value(data, "effective_to"),
      content,
    };
  }
  return {
    period_start: value(data, "period_start"),
    period_end: value(data, "period_end"),
    kind: value(data, "kind"),
    rule_id: value(data, "rule_id"),
    employee_ids: data.getAll("employee_ids").map(String),
    supersedes_id: value(data, "supersedes_id") || null,
  };
}
export async function fileBody(file: File, kind: string) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > 2_000_000)
    throw new Error("حجم فایل باید حداکثر دو مگابایت باشد.");
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { kind, filename: file.name, data_base64: btoa(binary) };
}
export function download(data: {
  data_base64: string;
  media_type: string;
  filename: string;
}) {
  const raw = atob(data.data_base64),
    bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0)),
    url = URL.createObjectURL(new Blob([bytes], { type: data.media_type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = data.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
