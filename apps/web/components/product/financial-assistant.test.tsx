import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/product-api";
import { FinancialAssistant, type AssistantAnswer } from "./financial-assistant";

vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
const suggestion = "کدام مطالبات را امروز پیگیری کنیم؟";
const answer: AssistantAnswer = {
  request_id: "request", mode: "rules", status: "answered", answer_fa: "پیگیری را از مشتری زیر شروع کنید.",
  as_of_date: "2026-10-10", latest_invoice_date: "2026-10-01", latest_imported_at: "2026-10-08T12:00:00Z",
  total_outstanding_irr: "90071992547409931", total_overdue_irr: "90071992547409931", customer_count: 1,
  caveats_fa: ["سررسید بعضی فاکتورها مشخص نیست."],
  priorities: [{ customer_id: "customer", customer_name: "مشتری نمونه", overdue_amount_irr: "90071992547409931",
    max_delay_days: 12, overdue_invoice_count: 1, omitted_evidence_count: 0,
    evidence: [{ invoice_id: "invoice", invoice_no: "84", remaining_amount_irr: "90071992547409931", due_date: "2026-09-28", delay_days: 12,
      import_batch_id: "batch", filename: "sales.xlsx", sheet: "فروش", row_number: 7 }],
  }],
};
beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (path) => String(path).endsWith("capabilities") ? { model_configured: false } : answer);
});

async function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: "دستیار مالی" }));
  await screen.findByRole("complementary", { name: "دستیار مالی" });
}

it("does not send financial requests until the panel opens and a question is chosen", async () => {
  render(<FinancialAssistant companyId="company" companyName="شرکت نمونه" />);
  expect(api).not.toHaveBeenCalled();
  await openPanel();
  expect(api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: suggestion }));
  await screen.findByText("پیگیری را از مشتری زیر شروع کنید.");
  expect(api).toHaveBeenLastCalledWith("/companies/company/assistant/ask", expect.objectContaining({ method: "POST", body: JSON.stringify({ question: suggestion }) }));
  expect(screen.getAllByTitle("۹۰٬۰۷۱٬۹۹۲٬۵۴۷٬۴۰۹٬۹۳۱ ریال").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByText("جزئیات و منابع پاسخ"));
  fireEvent.click(screen.getByText("مشاهده فاکتورها و شواهد"));
  expect(screen.getByRole("link", { name: /sales.xlsx/ })).toHaveAttribute("href", "/companies/company/imports/batch");
  expect(screen.getByText("سررسید بعضی فاکتورها مشخص نیست.")).toBeInTheDocument();
});

it("retries an error without claiming that empty data means zero", async () => {
  render(<FinancialAssistant companyId="company" companyName="شرکت نمونه" />);
  await openPanel();
  vi.mocked(api).mockRejectedValueOnce(Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: suggestion }));
  expect(await screen.findByRole("alert")).toHaveTextContent("پاسخ دریافت نشد");
  vi.mocked(api).mockResolvedValueOnce({ ...answer, status: "no_data", answer_fa: "فایل فروش لازم است.", total_outstanding_irr: null, total_overdue_irr: null, priorities: [] });
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  await screen.findByText("فایل فروش لازم است.");
  expect(screen.queryByText("کل مطالبات")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "افزودن فایل فروش" })).toHaveAttribute("href", "/companies/company/imports");
});

it("prevents duplicate submissions and ignores an old company response", async () => {
  let resolve: (value: AssistantAnswer) => void = () => {};
  const deferred = new Promise<AssistantAnswer>((done) => { resolve = done; });
  const view = render(<FinancialAssistant companyId="company" companyName="شرکت اول" />);
  await openPanel();
  vi.mocked(api).mockReturnValueOnce(deferred);
  fireEvent.click(screen.getByRole("button", { name: suggestion }));
  expect(screen.getByRole("button", { name: "در حال بررسی…" })).toBeDisabled();
  const options = vi.mocked(api).mock.calls.at(-1)?.[1];
  view.rerender(<FinancialAssistant companyId="other" companyName="شرکت دوم" />);
  expect(options?.signal?.aborted).toBe(true);
  await act(async () => { resolve(answer); await deferred; });
  expect(screen.queryByText("مشتری نمونه")).not.toBeInTheDocument();
  await openPanel();
  expect(screen.getByText("شرکت دوم")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: suggestion }));
  await waitFor(() => expect(api).toHaveBeenLastCalledWith("/companies/other/assistant/ask", expect.anything()));
});

it("keeps previous messages when a new question is unsupported", async () => {
  render(<FinancialAssistant companyId="company" companyName="شرکت نمونه" />);
  await openPanel();
  fireEvent.click(screen.getByRole("button", { name: suggestion }));
  await screen.findByText("پیگیری را از مشتری زیر شروع کنید.");
  vi.mocked(api).mockResolvedValueOnce({ ...answer, status: "unsupported", answer_fa: "این موضوع هنوز پشتیبانی نمی‌شود.", total_outstanding_irr: null, total_overdue_irr: null, priorities: [] });
  fireEvent.change(screen.getByRole("textbox", { name: "پرسش شما" }), { target: { value: "فاکتور را حذف کن" } });
  fireEvent.click(screen.getByRole("button", { name: "ارسال پیام" }));
  await screen.findByText("این موضوع هنوز پشتیبانی نمی‌شود.");
  expect(screen.getByText("۱. مشتری نمونه")).toBeInTheDocument();
});

it("opens a non-modal panel, keeps the page usable, and restores launcher focus on Escape", async () => {
  const onOpenChange = vi.fn();
  render(<><button>کنترل صفحه</button><FinancialAssistant companyId="company" companyName="شرکت نمونه" onOpenChange={onOpenChange} /></>);
  const launcher = screen.getByRole("button", { name: "دستیار مالی" });
  expect(launcher).toHaveAttribute("aria-expanded", "false");
  await openPanel();
  expect(screen.getByRole("complementary", { name: "دستیار مالی" })).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "پرسش شما" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "کنترل صفحه" })).toBeEnabled();
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(launcher).toHaveFocus();
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

it("sends with Enter, clears the composer, and preserves conversation after reopening", async () => {
  render(<FinancialAssistant companyId="company" companyName="شرکت نمونه" />);
  await openPanel();
  const input = screen.getByRole("textbox", { name: "پرسش شما" });
  fireEvent.change(input, { target: { value: suggestion } });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  expect(api).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  await screen.findByText("پیگیری را از مشتری زیر شروع کنید.");
  expect(input).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "بستن دستیار مالی" }));
  await openPanel();
  expect(screen.getByText(suggestion)).toBeInTheDocument();
  expect(screen.getByText("پیگیری را از مشتری زیر شروع کنید.")).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "خلاصه مطالبات شرکت چیست؟" } });
  fireEvent.click(screen.getByRole("button", { name: "ارسال پیام" }));
  await waitFor(() => expect(screen.getAllByText("پیگیری را از مشتری زیر شروع کنید.")).toHaveLength(2));
  expect(screen.getByRole("log")).toBeInTheDocument();
});

it("uses the server conversation identifier for followups and clears it for a new chat", async () => {
  vi.mocked(api).mockResolvedValue({ ...answer, conversation_id: "conversation" });
  render(<FinancialAssistant companyId="company" companyName="شرکت نمونه" />);
  await openPanel();
  fireEvent.click(screen.getByRole("button", { name: suggestion }));
  await screen.findByText("پیگیری را از مشتری زیر شروع کنید.");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "چرا؟" } });
  fireEvent.click(screen.getByRole("button", { name: "ارسال پیام" }));
  await waitFor(() => expect(api).toHaveBeenLastCalledWith("/companies/company/assistant/ask", expect.objectContaining({ body: JSON.stringify({ question: "چرا؟", conversation_id: "conversation" }) })));
  await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "گفتگوی جدید" }));
  expect(screen.queryByText("پیگیری را از مشتری زیر شروع کنید.")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "سلام" } });
  fireEvent.click(screen.getByRole("button", { name: "ارسال پیام" }));
  await waitFor(() => expect(api).toHaveBeenLastCalledWith("/companies/company/assistant/ask", expect.objectContaining({ body: JSON.stringify({ question: "سلام" }) })));
});
