import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createDefaultStudioSpec } from "@/lib/report-studio";
import { ReportStudioView } from "./report-studio-view";

const saveTemplate = vi.fn();
vi.mock("@/hooks/workspace", () => ({ useWorkspace: () => ({
  company: { id: "c", name: "شرکت" }, user: { id: "u" }, canWrite: true,
}) }));
vi.mock("@/hooks/use-report-studio", () => ({ useReportStudio: () => ({
  spec: createDefaultStudioSpec("p"), preview: { sections: [], company_name: "شرکت" },
  definitionsLoading: false, previewLoading: false, busy: false, error: null,
  selectedDefinition: { id: "selected", name: "قالب جاری" },
  definitions: [{ id: "unrelated", name: "قالب ذخیره‌شده دیگر" }],
  saveTemplate, resetToDefault: vi.fn(),
}) }));
vi.mock("../page-parts", () => ({
  PageHeader: ({ title, action }: { title: string; action: React.ReactNode }) => <header><h1>{title}</h1>{action}</header>,
  Panel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>, NoCompany: () => null,
}));

it("opens the current definition for editing without a saved-templates toolbar", () => {
  render(<ReportStudioView definitionId="selected" />);
  expect(screen.queryByText("قالب‌های ذخیره‌شده:")).not.toBeInTheDocument();
  expect(screen.queryByText("قالب ذخیره‌شده دیگر")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "ذخیره تغییرات" }));
  expect(screen.getByRole("dialog", { name: "ذخیره قالب گزارش" })).toBeVisible();
  expect(screen.getByLabelText("نام قالب گزارش")).toHaveValue("قالب جاری");
});
