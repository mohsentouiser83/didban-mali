import type { Employee } from "./types";
export const WORK_TEMPLATE_LIMIT = 1000;
function csvCell(raw: string): string {
  // Excel treats a leading tab as text; the import parser trims it from identifiers.
  const safe = /^[=+\-@]/.test(raw.trimStart()) ? "\t" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function workTemplate(employees: Employee[]): string {
  if (!employees.length || employees.length > WORK_TEMPLATE_LIMIT)
    throw new Error("برای هر قالب یک تا هزار کارمند انتخاب کنید.");
  const headings = [
    "personnel_code",
    "employee_name",
    "period_start",
    "period_end",
    "period_days",
    "worked_days",
    "worked_hours",
    "unit",
  ];
  return (
    "\uFEFF" +
    [
      headings.join(","),
      ...employees.map((e) =>
        [e.personnel_code, e.profile.name, "", "", "", "", "", "IRR"]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n")
  );
}
export function downloadPayrollCsv(content: string, name: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
