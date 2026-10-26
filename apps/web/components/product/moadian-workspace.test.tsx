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
    return (path.includes("/comparisons?limit=25") ? [] : path.includes("/imports?") ? batches.filter((b) => b.source_kind === params.get("source_kind")) : { run_id: "saved-run", items: [], counts: { matched: 2, difference: 1 }, total: 0, limit: 25, offset: 0, start_date: "2026-10-01", end_date: "2026-10-11", rejected_rows: 0 }) as never;
  });
});

it("guides source selection into dates, then results, filters and editing", async () => {
  render(<MoadianWorkspace company={company} />);
  await screen.findByRole("heading", { name: "هنوز تطبیقی انجام نشده است" });
  expect(screen.queryByRole("heading", { name: "انتخاب فایل‌های تطبیق" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "تطبیق جدید" }));
  await screen.findByRole("heading", { name: "انتخاب فایل‌های تطبیق" });
  expect(screen.getByRole("button", { name: "انتخاب بازه" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /حسابداری.xlsx/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /کارپوشه.xlsx/ }));
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
  fireEvent.click(screen.getByRole("checkbox", { name: /حسابداری.xlsx/ }));
  fireEvent.click(screen.getByRole("button", { name: "بستن" }));
  await screen.findByRole("heading", { name: "نتایج تطبیق" });
  expect(vi.mocked(api).mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});


it("shows the specific missing accounting input without an upload wizard or financial zero metrics", async () => {
  vi.mocked(api).mockImplementation(async (path) => path.includes("/imports?") ? batches.filter((b) => b.source_kind === "moadian_sales" && path.includes("source_kind=moadian_sales")) as never : [] as never);
  render(<MoadianWorkspace company={company} />);
  await screen.findByText("فاکتورهای حسابداری برای مقایسه با مؤدیان موجود نیست.");
  expect(screen.getByRole("link", { name: "تکمیل اسناد حسابداری" })).toHaveAttribute("href", "/companies/company/imports");
  expect(screen.getByRole("button", { name: "تطبیق جدید" })).toBeDisabled();
  expect(screen.queryByRole("heading", { name: "انتخاب فایل‌های تطبیق" })).not.toBeInTheDocument();
  expect(screen.queryByText("تطبیق با شماره مالیاتی")).not.toBeInTheDocument();
});

it("opens saved results even when the current import list fails to load", async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.includes("/imports?")) throw Error("source list unavailable");
    if (path.endsWith("/comparisons?limit=25")) return [{ id: "saved", direction: "sales", start_date: "2026-10-01", end_date: "2026-10-11", created_at: "2026-10-11" }] as never;
    return { run_id: "saved", direction: "sales", internal_batch_ids: ["internal"], portal_batch_ids: ["portal"], start_date: "2026-10-01", end_date: "2026-10-11", items: [], counts: { matched: 2 }, total: 0, limit: 25, offset: 0, rejected_rows: 0 } as never;
  });
  render(<MoadianWorkspace company={company} />);
  fireEvent.click(await screen.findByRole("button", { name: "مشاهده نتیجه" }));
  await screen.findByRole("heading", { name: "نتایج تطبیق" });
  expect(screen.getByText("فاکتوری در این بازه و فیلتر نیست.")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "انتخاب فایل‌های تطبیق" })).not.toBeInTheDocument();
});
