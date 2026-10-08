import { cloneElement, type ReactElement } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CashFlowWorkspace } from "./cashflow-workspace";
import { api } from "@/lib/product-api";
import type {
  CashFlowForecastResponse,
  CashFlowSummaryResponse,
  Company,
} from "@/lib/product-types";

vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
vi.mock("recharts", async (importActual) => {
  const actual = await importActual<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
    }: {
      children: ReactElement<{ width: number; height: number }>;
    }) => cloneElement(children, { width: 600, height: 290 }),
  };
});
const navigation = vi.hoisted(() => ({ query: "view=forecast", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
  useRouter: () => ({ push: navigation.push }),
  usePathname: () => "/companies/company/cashflow",
}));
beforeEach(() => { navigation.query = "view=forecast"; navigation.push.mockClear(); });
const mockedApi = vi.mocked(api);
const company: Company = {
  id: "company",
  legal_name: "شرکت نمونه",
  currency: "IRR",
  created_at: "2026-10-08",
};
const summary: CashFlowSummaryResponse = {
  as_of_date: "2026-10-08",
  current_cash_irr: "0",
  monthly_burn_rate_irr: "300000000",
  runway_days: 0,
  runway_months: 0,
  runway_status: "critical",
  safety_buffer_irr: "60000000",
  first_deficit_week: 1,
  lowest_projected_cash_irr: "-10000000",
};
const forecast: CashFlowForecastResponse = {
  as_of_date: "2026-10-08",
  scenario: "base",
  safety_buffer_irr: "60000000",
  current_cash_irr: "0",
  total_projected_inflows_irr: "100000000",
  total_projected_outflows_irr: "200000000",
  net_period_movement_irr: "-100000000",
  inflow_sources: [],
  outflow_sources: [],
  weeks: [
    {
      week_number: 1,
      start_date: "2026-10-09",
      end_date: "2026-10-15",
      starting_cash_irr: "0",
      projected_inflows_irr: "10000000",
      projected_outflows_irr: "20000000",
      net_change_irr: "-10000000",
      ending_cash_irr: "-10000000",
      is_deficit: true,
      deficit_amount_irr: "70000000",
    },
    {
      week_number: 2,
      start_date: "2026-10-16",
      end_date: "2026-10-22",
      starting_cash_irr: "-10000000",
      projected_inflows_irr: "50000000",
      projected_outflows_irr: "10000000",
      net_change_irr: "40000000",
      ending_cash_irr: "30000000",
      is_deficit: true,
      deficit_amount_irr: "30000000",
    },
  ],
};
beforeEach(() => {
  mockedApi.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
function resolveData() {
  mockedApi.mockImplementation(async (path) =>
    path.includes("summary") ? summary : forecast,
  );
}

describe("Cashflow workspace", () => {
  it("keeps zero cash and zero runway visible rather than declaring the data absent", async () => {
    resolveData();
    render(<CashFlowWorkspace company={company} />);
    const metrics = await screen.findByRole("region", {
      name: "موقعیت نقدینگی",
    });
    expect(
      within(metrics).getByRole("heading", { name: "موجودی نقد در دسترس" }),
    ).toBeVisible();
    expect(
      screen.queryByText("اطلاعات نقدینگی در دسترس نیست"),
    ).not.toBeInTheDocument();
    expect(within(metrics).getByText("هفته ۱")).toBeVisible();
    expect(within(metrics).queryByText("پایدار")).not.toBeInTheDocument();
  });
  it("updates risk to the selected scenario with one forecast request", async () => {
    resolveData();
    render(<CashFlowWorkspace company={company} />);
    await screen.findByRole("group", { name: "سناریوی پیش‌بینی" });
    mockedApi.mockImplementation(async (path) =>
      path.includes("summary")
        ? summary
        : {
            ...forecast,
            scenario: "optimistic",
            weeks: forecast.weeks.map((week) => ({
              ...week,
              is_deficit: false,
            })),
          },
    );
    fireEvent.click(screen.getByRole("button", { name: "خوش‌بینانه" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "خوش‌بینانه" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(await screen.findByText("بدون افت در ۱۳ هفته")).toBeVisible();
    expect(
      mockedApi.mock.calls.filter(([path]) =>
        path.includes("scenario=optimistic"),
      ),
    ).toHaveLength(1);
  });
  it("allows selecting a week and reading its exact figures in the table", async () => {
    resolveData();
    render(<CashFlowWorkspace company={company} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "انتخاب هفته ۲، کسری ذخیره" }),
    );
    expect(screen.getByRole("heading", { name: "هفته ۲" })).toBeVisible();
    fireEvent.click(
      screen.getByText("جدول کامل پیش‌بینی هفتگی", { exact: false }),
    );
    expect(
      screen.getByRole("table", {
        name: "جدول پیش‌بینی نقدینگی؛ همه مبالغ به ریال",
      }),
    ).toBeVisible();
  });
  it("shows a recoverable error instead of the no-data state when both requests fail", async () => {
    mockedApi.mockRejectedValue(new Error("offline"));
    render(<CashFlowWorkspace company={company} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "اطلاعات نقدینگی دریافت نشد",
    );
    expect(
      screen.queryByText("اطلاعات نقدینگی در دسترس نیست"),
    ).not.toBeInTheDocument();
    resolveData();
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    expect(
      await screen.findByRole("region", { name: "موقعیت نقدینگی" }),
    ).toBeVisible();
  });
  it("ignores late responses from the previous company", async () => {
    let finishOld!: (value: CashFlowSummaryResponse) => void;
    mockedApi
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce(forecast);
    const { rerender } = render(<CashFlowWorkspace company={company} />);
    mockedApi.mockImplementation(async (path) =>
      path.includes("summary")
        ? { ...summary, current_cash_irr: "900000000" }
        : { ...forecast, current_cash_irr: "900000000" },
    );
    rerender(
      <CashFlowWorkspace company={{ ...company, id: "next-company" }} />,
    );
    await screen.findByRole("region", { name: "موقعیت نقدینگی" });
    await act(async () =>
      finishOld({ ...summary, current_cash_irr: "888888888" }),
    );
    const metrics = screen.getByRole("region", { name: "موقعیت نقدینگی" });
    expect(metrics.querySelector('[title*="۸۸۸٬۸۸۸٬۸۸۸"]')).toBeNull();
    expect(metrics.querySelector('[title*="۹۰۰٬۰۰۰٬۰۰۰"]')).not.toBeNull();
  });
  it("does not show the sustainable backend sentinel as 999 days", async () => {
    mockedApi.mockImplementation(async (path) =>
      path.includes("summary")
        ? {
            ...summary,
            runway_days: 999,
            runway_months: 99,
            runway_status: "sustainable",
            monthly_burn_rate_irr: "0",
          }
        : forecast,
    );
    render(<CashFlowWorkspace company={company} />);
    await screen.findByRole("region", { name: "موقعیت نقدینگی" });
    expect(screen.queryByText("۹۹۹")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByText("اگر زمان وصول یا پرداخت تغییر کند؟", { exact: false }),
    );
    expect(screen.getByText("قابل محاسبه نیست")).toBeVisible();
  });
  it("supports keyboard simulation and resetting the assumptions", async () => {
    resolveData();
    render(<CashFlowWorkspace company={company} />);
    await screen.findByRole("region", { name: "موقعیت نقدینگی" });
    fireEvent.click(
      screen.getByText("اگر زمان وصول یا پرداخت تغییر کند؟", { exact: false }),
    );
    const slider = screen.getByRole("slider", { name: "زمان وصول مطالبات" });
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(screen.getByText("۱ روز زودتر")).toBeVisible();
    expect(slider).toHaveAttribute("aria-valuenow", "-1");
    expect(
      screen.getByText(
        "سناریوی فرضی فعال است؛ هیچ داده یا تعهدی در شرکت تغییر نکرده است.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "بازنشانی" }));
    expect(slider).toHaveAttribute("aria-valuenow", "0");
  });
});


describe("Cashflow forecast decisions", () => {
  it("preserves the selected week across scenarios and compares it with base", async () => {
    mockedApi.mockImplementation(async (path) => path.includes("summary") ? summary : path.includes("optimistic") ? { ...forecast, scenario: "optimistic", weeks: forecast.weeks.map((week) => ({ ...week, ending_cash_irr: String(Number(week.ending_cash_irr) + 10000000) })) } : forecast);
    render(<CashFlowWorkspace company={company} />);
    fireEvent.click(await screen.findByRole("button", { name: "انتخاب هفته ۲، کسری ذخیره" }));
    fireEvent.click(screen.getByRole("button", { name: "خوش‌بینانه" }));
    expect(await screen.findByText(/تفاوت مانده این هفته با پایه/)).toHaveTextContent("+۱٫۰");
    expect(screen.getByRole("heading", { name: "هفته ۲" })).toBeVisible();
    expect(screen.getByText(/ضریب احتمال وصول: ۱٫۱۵/)).toBeVisible();
  });
  it("applies a chosen reserve to summary and forecast together", async () => {
    resolveData();
    render(<CashFlowWorkspace company={company} />);
    fireEvent.keyDown(await screen.findByRole("combobox", { name: "سیاست ذخیره برای این پیش‌بینی" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "۳۰ روز مصرف" }));
    await waitFor(() => expect(mockedApi.mock.calls.some(([path]) => path.includes("summary?safety_buffer_irr=300000000"))).toBe(true));
    expect(mockedApi.mock.calls.some(([path]) => path.includes("scenario=base&safety_buffer_irr=300000000"))).toBe(true);
    expect(screen.getByText(/آستانه برابر مصرف روزانه/)).toBeVisible();
  });
});

it("keeps the current view focused and preserves query context when opening forecast", async () => {
  navigation.query = "view=current&period=2026-10";
  resolveData();
  const { rerender } = render(<CashFlowWorkspace company={company} />);
  await screen.findByRole("region", { name: "موقعیت نقدینگی" });
  expect(screen.queryByRole("group", { name: "سناریوی پیش‌بینی" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "ارزیابی تاب‌آوری" })).toBeVisible();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "پیش‌بینی نقدینگی" }), { button: 0 });
  expect(navigation.push).toHaveBeenCalledWith("/companies/company/cashflow?view=forecast&period=2026-10", { scroll: false });
  navigation.query = "view=forecast&period=2026-10";
  rerender(<CashFlowWorkspace company={company} />);
  expect(screen.getByRole("group", { name: "سناریوی پیش‌بینی" })).toBeVisible();
  expect(screen.queryByRole("region", { name: "ارزیابی تاب‌آوری" })).not.toBeInTheDocument();
  navigation.query = "view=current&period=2026-10";
  rerender(<CashFlowWorkspace company={company} />);
  expect(screen.queryByRole("group", { name: "سناریوی پیش‌بینی" })).not.toBeInTheDocument();
});
