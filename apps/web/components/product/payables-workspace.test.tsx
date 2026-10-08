import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayablesWorkspace } from "./payables-workspace";
import { api } from "@/lib/product-api";
import type {
  Company,
  PayablesSummaryResponse,
  VendorPayableItem,
} from "@/lib/product-types";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);
const company: Company = {
  id: "one",
  legal_name: "شرکت نمونه",
  currency: "IRR",
  created_at: "2026-10-08",
};
const summary: PayablesSummaryResponse = {
  as_of_date: "2026-10-08",
  total_payables_irr: "100000000",
  total_overdue_irr: "30000000",
  overdue_ratio: 0.3,
  dpo_days: 50,
  dso_days: 40,
  ccc_days: -10,
  vendor_count: 2,
  high_risk_vendor_count: 1,
  buckets: [
    {
      bucket_key: "not_due",
      label_fa: "جاری",
      amount_irr: "70000000",
      vendor_count: 1,
      share_percentage: 70,
    },
    {
      bucket_key: "1_30",
      label_fa: "۱ تا ۳۰ روز",
      amount_irr: "30000000",
      vendor_count: 1,
      share_percentage: 30,
    },
  ],
};
const vendor: VendorPayableItem = {
  counterparty_id: "a",
  name: "شرکت آریا",
  national_id: "1234",
  total_payable_irr: "50000000",
  overdue_amount_irr: "30000000",
  overdue_ratio: 0.6,
  avg_delay_days: 20,
  risk_level: "high",
  risk_score: 65,
  recommended_action: "بررسی زمان پرداخت",
  buckets: {
    not_due: "20000000",
    "1_30": "30000000",
    "31_60": "0",
    "61_90": "0",
    "90_plus": "0",
    due_date_missing: "0",
  },
  share_of_total_payables: 50,
};
const current: VendorPayableItem = {
  ...vendor,
  counterparty_id: "b",
  name: "شرکت کیان",
  overdue_amount_irr: "0",
  risk_level: "low",
  buckets: { ...vendor.buckets, "1_30": "0" },
};
function respond(sum = summary) {
  mockedApi.mockImplementation(async (path) =>
    path.endsWith("summary")
      ? sum
      : { items: [vendor, current], as_of_date: sum.as_of_date },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  respond();
});
describe("payables workspace", () => {
  it("keeps valid zero totals and explains the cash gap boundary", async () => {
    respond({
      ...summary,
      total_payables_irr: "0",
      total_overdue_irr: "0",
      vendor_count: 0,
    });
    render(<PayablesWorkspace company={company} />);
    expect(
      await screen.findByRole("region", { name: "موقعیت بدهی‌ها" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/چرخه کامل تبدیل نقد نیست/)).toBeInTheDocument();
    expect(
      screen.queryByText("خلاصه بدهی‌ها در دسترس نیست"),
    ).not.toBeInTheDocument();
  });
  it("filters vendors by aging and clears the selection", async () => {
    render(<PayablesWorkspace company={company} />);
    const table = await screen.findByRole("table", {
      name: "بدهی به تأمین‌کنندگان",
    });
    fireEvent.click(screen.getByRole("button", { name: /^۱ تا ۳۰ روز/ }));
    expect(within(table).queryByText("شرکت کیان")).not.toBeInTheDocument();
    expect(within(table).getByText("شرکت آریا")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "پاک‌کردن فیلترها" }));
    expect(within(table).getByText("شرکت کیان")).toBeInTheDocument();
  });
  it("opens an accessible vendor detail dialog", async () => {
    render(<PayablesWorkspace company={company} />);
    const table = await screen.findByRole("table", {
      name: "بدهی به تأمین‌کنندگان",
    });
    fireEvent.click(
      within(table).getByRole("button", { name: "جزئیات بدهی‌ها شرکت آریا" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "شرکت آریا" }),
    ).toBeInTheDocument();
  });
  it("retains available totals when the vendor list fails", async () => {
    mockedApi.mockImplementation(async (path) => {
      if (path.endsWith("summary")) return summary;
      throw new Error("offline");
    });
    render(<PayablesWorkspace company={company} />);
    expect(
      await screen.findByRole("region", { name: "موقعیت بدهی‌ها" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "فهرست تأمین‌کنندگان دریافت نشده است؛ دوباره تلاش کنید.",
      ),
    ).toBeInTheDocument();
  });
});
