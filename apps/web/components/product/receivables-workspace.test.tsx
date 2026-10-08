import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReceivablesWorkspace } from "./receivables-workspace";
import { api } from "@/lib/product-api";
import { toast } from "sonner";
import type {
  Company,
  CustomerReceivableItem,
  ReceivablesSummaryResponse,
  ReceivableInvoiceItem,
} from "@/lib/product-types";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const mockedApi = vi.mocked(api);
const company: Company = {
  id: "one",
  legal_name: "شرکت نمونه",
  currency: "IRR",
  created_at: "2026-10-08",
};
const summary: ReceivablesSummaryResponse = {
  as_of_date: "2026-10-08",
  total_receivables_irr: "100000000",
  total_overdue_irr: "30000000",
  overdue_ratio: 0.3,
  dso_days: 40,
  customer_count: 2,
  high_risk_customer_count: 1,
  buckets: [
    {
      bucket_key: "not_due",
      label_fa: "جاری",
      amount_irr: "70000000",
      invoice_count: 1,
      share_percentage: 70,
    },
    {
      bucket_key: "1_30",
      label_fa: "۱ تا ۳۰ روز",
      amount_irr: "30000000",
      invoice_count: 1,
      share_percentage: 30,
    },
  ],
};
const customer: CustomerReceivableItem = {
  counterparty_id: "a",
  name: "شرکت آریا",
  national_id: "1234",
  total_outstanding_irr: "50000000",
  overdue_amount_irr: "30000000",
  overdue_ratio: 0.6,
  avg_delay_days: 20,
  risk_level: "high",
  risk_score: 65,
  recommended_action: "بررسی مانده با مشتری",
  buckets: {
    not_due: "20000000",
    "1_30": "30000000",
    "31_60": "0",
    "61_90": "0",
    "90_plus": "0",
    due_date_missing: "0",
  },
  open_invoices_count: 1,
};
const currentCustomer: CustomerReceivableItem = {
  ...customer,
  counterparty_id: "b",
  name: "شرکت کیان",
  national_id: null,
  risk_level: "low",
  overdue_amount_irr: "0",
  buckets: { ...customer.buckets, "1_30": "0" },
};
const invoice: ReceivableInvoiceItem = {
  id: "inv",
  invoice_no: "123",
  counterparty_name: customer.name,
  counterparty_id: "a",
  issue_date: "2026-09-01",
  due_date: null,
  gross_amount_irr: "50000000",
  paid_amount_irr: "0",
  remaining_amount_irr: "50000000",
  delay_days: 0,
  bucket_key: "due_date_missing",
  status: null,
};
function respond(sum = summary) {
  mockedApi.mockImplementation(async (path) =>
    path.endsWith("summary")
      ? sum
      : path.endsWith("customers")
        ? { items: [customer, currentCustomer], as_of_date: sum.as_of_date }
        : { items: [invoice], as_of_date: sum.as_of_date },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  respond();
});
describe("receivables workspace", () => {
  it("keeps legitimate zero totals visible", async () => {
    respond({
      ...summary,
      total_receivables_irr: "0",
      total_overdue_irr: "0",
      customer_count: 0,
      overdue_ratio: 0,
    });
    render(<ReceivablesWorkspace company={company} />);
    expect(
      await screen.findByRole("region", { name: "موقعیت مطالبات" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("خلاصه مطالبات در دسترس نیست"),
    ).not.toBeInTheDocument();
  });
  it("filters customers by aging and clears the selection", async () => {
    render(<ReceivablesWorkspace company={company} />);
    const table = await screen.findByRole("table", { name: "مطالبات مشتریان" });
    fireEvent.click(screen.getByRole("button", { name: /^۱ تا ۳۰ روز/ }));
    expect(within(table).queryByText("شرکت کیان")).not.toBeInTheDocument();
    expect(within(table).getByText("شرکت آریا")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "پاک‌کردن فیلترها" }));
    expect(within(table).getByText("شرکت کیان")).toBeInTheDocument();
  });
  it("matches Persian digits and Arabic letters in search", async () => {
    render(<ReceivablesWorkspace company={company} />);
    const table = await screen.findByRole("table", { name: "مطالبات مشتریان" });
    fireEvent.change(
      screen.getByRole("textbox", { name: "جستجوی مشتری یا شناسه" }),
      { target: { value: "۱۲۳۴" } },
    );
    expect(within(table).getByText("شرکت آریا")).toBeInTheDocument();
    expect(within(table).queryByText("شرکت کیان")).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("textbox", { name: "جستجوی مشتری یا شناسه" }),
      { target: { value: "كيان" } },
    );
    expect(within(table).getByText("شرکت کیان")).toBeInTheDocument();
  });
  it("uses an accessible detail dialog and makes reminder copying honest", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<ReceivablesWorkspace company={company} />);
    const table = await screen.findByRole("table", { name: "مطالبات مشتریان" });
    fireEvent.click(
      within(table).getByRole("button", { name: "جزئیات مطالبات شرکت آریا" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "شرکت آریا" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "تهیه پیش‌نویس یادآوری" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "یادآوری برای شرکت آریا" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "متن یادآوری" }), {
      target: { value: "متن ویرایش‌شده" },
    });
    fireEvent.click(screen.getByRole("button", { name: "کپی متن یادآوری" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "متن ویرایش‌شده",
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("shows failures as errors and recovers with retry", async () => {
    mockedApi.mockRejectedValue(new Error("offline"));
    render(<ReceivablesWorkspace company={company} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "دریافت بخشی از اطلاعات انجام نشد",
    );
    expect(
      screen.queryByText("مشتری دارای مانده در داده‌های فعلی ثبت نشده است."),
    ).not.toBeInTheDocument();
    respond();
    fireEvent.click(screen.getByRole("button", { name: "تلاش مجدد" }));
    expect(
      await screen.findByRole("table", { name: "مطالبات مشتریان" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("ignores a late response from a previous company", async () => {
    let resolve!: (value: unknown) => void;
    mockedApi.mockImplementation((path) =>
      path.includes("/one/")
        ? new Promise((r) => {
            if (path.endsWith("summary")) resolve = r;
            else r({ items: [] });
          })
        : Promise.resolve(
            path.endsWith("summary")
              ? { ...summary, customer_count: 9 }
              : { items: [] },
          ),
    );
    const view = render(<ReceivablesWorkspace company={company} />);
    view.rerender(<ReceivablesWorkspace company={{ ...company, id: "two" }} />);
    await screen.findByRole("region", { name: "موقعیت مطالبات" });
    await act(async () => {
      resolve(summary);
    });
    expect(screen.getByText("۹ مشتری دارای مانده")).toBeInTheDocument();
  });
});


describe("receivable decisions", () => {
  it("shows the selected aging amount separately from the full customer balance", async () => {
    render(<ReceivablesWorkspace company={company} />);
    const table = await screen.findByRole("table", { name: "مطالبات مشتریان" });
    fireEvent.click(screen.getByRole("button", { name: /^۱ تا ۳۰ روز/ }));
    expect(within(table).getByRole("columnheader", { name: "مانده ۱ تا ۳۰ روز" })).toBeVisible();
    expect(within(table).getByRole("columnheader", { name: "کل مانده مشتری" })).toBeVisible();
    expect(screen.getByText(/ستون مانده بازه فقط/)).toBeVisible();
  });
  it("drills from a customer to only that customer's invoices", async () => {
    mockedApi.mockImplementation(async (path) => path.endsWith("summary") ? summary : path.endsWith("customers") ? { items: [customer, currentCustomer] } : { items: [invoice, { ...invoice, id: "other", invoice_no: "987", counterparty_id: "b", counterparty_name: currentCustomer.name }] });
    render(<ReceivablesWorkspace company={company} />);
    const table = await screen.findByRole("table", { name: "مطالبات مشتریان" });
    fireEvent.click(within(table).getByRole("button", { name: "جزئیات مطالبات شرکت آریا" }));
    fireEvent.click(screen.getByRole("button", { name: "مشاهده فاکتورهای این مشتری" }));
    const invoices = await screen.findByRole("table", { name: "فاکتورهای باز مطالبات" });
    expect(within(invoices).queryByText("شرکت کیان")).not.toBeInTheDocument();
    expect(within(invoices).getByText("شرکت آریا")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "همه مشتریان" }));
    expect(within(invoices).getByText("شرکت کیان")).toBeVisible();
  });
  it("sorts the complete invoice result before pagination and resets on search", async () => {
    mockedApi.mockImplementation(async (path) => path.endsWith("summary") ? summary : path.endsWith("customers") ? { items: [customer] } : { items: Array.from({ length: 41 }, (_, index) => ({ ...invoice, id: String(index), invoice_no: String(1000 + index), remaining_amount_irr: String((index + 1) * 10000000) })) });
    render(<ReceivablesWorkspace company={company} />);
    await screen.findByRole("table", { name: "مطالبات مشتریان" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "فاکتورهای باز" }), { button: 0, ctrlKey: false });
    const table = await screen.findByRole("table", { name: "فاکتورهای باز مطالبات" });
    expect(within(table).getAllByRole("row")).toHaveLength(21);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "ترتیب نمایش" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "کمترین مانده" }));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("۱۰۰۰");
    fireEvent.click(screen.getByRole("button", { name: "صفحه بعد" }));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("۱۰۲۰");
    fireEvent.change(screen.getByRole("textbox", { name: "جستجوی مشتری یا شماره فاکتور" }), { target: { value: "1040" } });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "صفحه قبل" })).toBeDisabled();
  });
});
