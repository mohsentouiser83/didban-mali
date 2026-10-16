import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/product-api";
import type { Company } from "@/lib/product-types";
import { MoadianWorkspace } from "./moadian-workspace";

vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value: string; onValueChange: (value: string) => void }) => <select value={value} onChange={(e) => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
}));
vi.mock("@/components/ui/persian-date-picker", () => ({ PersianDatePicker: ({ id, value, onValueChange }: { id: string; value: string; onValueChange: (value: string) => void }) => <input id={id} value={value} onChange={(e) => onValueChange(e.target.value)} /> }));
vi.mock("./upload-wizard", () => ({ UploadWizard: () => null }));
const company = { id: "company", role: "owner" } as Company;
const batches = [{ id: "internal", source_kind: "sales", status: "completed", original_name: "حسابداری.xlsx", created_at: "2026-10-11" }, { id: "portal", source_kind: "moadian_sales", status: "completed", original_name: "کارپوشه.xlsx", created_at: "2026-10-11" }];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api).mockImplementation(async (path) => {
    const params = new URLSearchParams(path.split("?")[1]);
    return (path.includes("/imports?") ? batches.filter((b) => b.source_kind === params.get("source_kind")) : { items: [], counts: { matched: 2, difference: 1 }, total: 0, limit: 25, offset: 0, start_date: "2026-10-01", end_date: "2026-10-11", rejected_rows: 0 }) as never;
  });
});

it("guides source selection into dates, then results, filters and editing", async () => {
  const { container } = render(<MoadianWorkspace company={company} />);
  await screen.findByRole("heading", { name: "انتخاب فایل‌های تطبیق" });
  expect(screen.getByRole("button", { name: "انتخاب بازه" })).toBeDisabled();
  const selectors = container.querySelectorAll("select");
  fireEvent.change(selectors[0], { target: { value: "internal" } });
  fireEvent.change(selectors[1], { target: { value: "portal" } });
  fireEvent.click(screen.getByRole("button", { name: "انتخاب بازه" }));
  expect(screen.getByRole("heading", { name: "بازه تطبیق" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "اجرای تطبیق" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("از تاریخ"), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText("تا تاریخ"), { target: { value: "2026-10-11" } });
  fireEvent.click(screen.getByRole("button", { name: "اجرای تطبیق" }));
  await screen.findByText("فاکتوری در این بازه و فیلتر نیست.");
  expect(screen.queryByRole("heading", { name: "بازه تطبیق" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /اختلاف اطلاعات/ }));
  await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) => path.includes("status=difference"))).toBe(true));
  expect(screen.getByRole("button", { name: /اختلاف اطلاعات/ })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "ویرایش تطبیق" }));
  expect(screen.getByRole("heading", { name: "انتخاب فایل‌های تطبیق" })).toBeInTheDocument();
});
