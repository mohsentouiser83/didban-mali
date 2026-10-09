import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReportsWorkspace } from "./reports-workspace";
import { api } from "@/lib/product-api";
import type { Company } from "@/lib/product-types";
vi.mock("@/lib/product-api", () => ({ api: vi.fn(), API_URL: "/api/v1" }));
const company = { id: "company", role: "owner" } as Company;
const report = { id: "report", title_fa: "گزارش کیان", period_start: "2026-09-01", period_end: "2026-09-30", created_at: "2026-10-09T10:00:00Z", status: "completed", download_ready: true, advisor_note: "یادداشت مدیر", payload: { overall_status: { summary_fa: "خلاصه مالی دوره" } } };
const analysis = { id: "analysis", period_start: "2026-09-01", period_end: "2026-09-30", status: "completed" };
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(api).mockImplementation(async (path) => String(path).includes("analysis-runs") ? [analysis] : [report]); });
it("keeps a single list and does not load creation dependencies for viewers", async () => {
  render(<ReportsWorkspace company={{ ...company, role: "viewer" }} />);
  await screen.findByRole("button", { name: "گزارش کیان" });
  expect(screen.getAllByRole("table")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "گزارش جدید" })).not.toBeInTheDocument();
  expect(vi.mocked(api)).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole("textbox", { name: "جستجوی گزارش" }), { target: { value: "كيان" } });
  expect(screen.getByRole("button", { name: "گزارش کیان" })).toBeInTheDocument();
});
it("opens the report details and download link in the shared drawer", async () => {
  render(<ReportsWorkspace company={company} />);
  fireEvent.click(await screen.findByRole("button", { name: "گزارش کیان" }));
  const drawer = within(screen.getByRole("dialog", { name: "گزارش کیان" }));
  expect(drawer.getByText("خلاصه مالی دوره")).toBeInTheDocument();
  expect(drawer.getByText("یادداشت مدیر")).toBeInTheDocument();
  expect(drawer.getByRole("link", { name: "دریافت PDF" })).toHaveAttribute("href", "/api/v1/companies/company/reports/report/download");
  fireEvent.click(drawer.getByRole("button", { name: "بستن" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("does not offer download before the PDF is ready", async () => {
  vi.mocked(api).mockResolvedValue([{ ...report, status: "queued", download_ready: false }]);
  render(<ReportsWorkspace company={company} />);
  fireEvent.click(await screen.findByRole("button", { name: "گزارش کیان" }));
  expect(screen.queryByRole("link", { name: "دریافت PDF" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("گزارش در صف تولید است");
});
it("creates a report from a completed analysis and preserves input on failure", async () => {
  const post = vi.fn().mockRejectedValueOnce(Error("offline")).mockResolvedValue({ ...report, id: "new", title_fa: "گزارش جدید مهر", status: "queued", download_ready: false });
  vi.mocked(api).mockImplementation(async (path, options) => options?.method === "POST" ? post(options) : String(path).includes("analysis-runs") ? [analysis] : [report]);
  render(<ReportsWorkspace company={company} />);
  await screen.findByRole("button", { name: "گزارش کیان" });
  fireEvent.click(screen.getByRole("button", { name: "گزارش جدید" }));
  fireEvent.change(await screen.findByLabelText("عنوان گزارش"), { target: { value: "گزارش جدید مهر" } });
  fireEvent.change(screen.getByLabelText("یادداشت (اختیاری)"), { target: { value: " بررسی ماهانه " } });
  fireEvent.click(screen.getByRole("button", { name: "ساخت گزارش" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("عنوان گزارش")).toHaveValue("گزارش جدید مهر");
  fireEvent.click(screen.getByRole("button", { name: "ساخت گزارش" }));
  await screen.findByRole("dialog", { name: "گزارش جدید مهر" });
  expect(JSON.parse(post.mock.calls[1][0].body)).toEqual({ analysis_run_id: "analysis", title_fa: "گزارش جدید مهر", advisor_note: "بررسی ماهانه" });
  expect(post.mock.calls[0][0].headers["Idempotency-Key"]).toBe(post.mock.calls[1][0].headers["Idempotency-Key"]);
});
it("recovers from list errors and removes the previous company's reports", async () => {
  vi.mocked(api).mockRejectedValueOnce(Error("offline"));
  const view = render(<ReportsWorkspace company={company} />);
  await screen.findByText("گزارش‌ها دریافت نشدند.");
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  await screen.findByRole("button", { name: "گزارش کیان" });
  vi.mocked(api).mockImplementation(() => new Promise(() => {}));
  view.rerender(<ReportsWorkspace company={{ ...company, id: "other" }} />);
  await waitFor(() => expect(screen.queryByRole("button", { name: "گزارش کیان" })).not.toBeInTheDocument());
});


it("refreshes queued reports until the PDF is ready", async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(api).mockImplementation(async (path) => String(path).endsWith("/reports/report") ? report : [{ ...report, status: "queued", download_ready: false }]);
    let view: ReturnType<typeof render>;
    await act(async () => { view = render(<ReportsWorkspace company={company} />); });
    expect(screen.getByText("در صف تولید")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByText("آماده دریافت")).toBeInTheDocument();
    expect(vi.mocked(api).mock.calls).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(vi.mocked(api).mock.calls).toHaveLength(2);
    view!.unmount();
  } finally { vi.useRealTimers(); }
});
