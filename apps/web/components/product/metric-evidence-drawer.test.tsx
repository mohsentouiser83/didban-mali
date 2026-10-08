import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetricEvidenceDrawer } from "./metric-evidence-drawer";
import type { MetricResultDTO } from "@/lib/product-types";
vi.mock("@/lib/product-api", () => ({ api: vi.fn().mockResolvedValue({sample_records:[],total_records:0}) }));
const metric = {
  metric_key:"open_payables", metric_version:"payables-v1", status:"available_with_warning",
  value_numeric:"17297400000.0000", unit:"irr", as_of_date:"2026-10-07", coverage_score:80,
  confidence:"high",input_record_count:120,excluded_record_count:0,warnings:["120 سند فاقد تاریخ سررسید هستند"],
  evidence:{title_fa:"بدهی‌های باز",definition_fa:"تعهدات پرداخت",formula_fa:"مجموع مانده‌ها",formula_version:"1",components:{},reconciliation_notes:[]},
} as unknown as MetricResultDTO;
beforeEach(() => vi.clearAllMocks());
describe("Metric evidence money and units", () => {
  it("formats decimal API strings as toman and exposes the exact rial value", async () => {
    render(<MetricEvidenceDrawer open onOpenChange={vi.fn()} companyId="company" metric={metric} />);
    expect(await screen.findByText("۱٫۷")).toBeVisible();
    expect(screen.getByText("میلیارد تومان")).toBeVisible();
    expect(screen.queryByText("17297400000.0000")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("مبلغ دقیق به ریال"));
    expect(screen.getByText("۱۷٬۲۹۷٬۴۰۰٬۰۰۰")).toBeVisible();
    expect(screen.getByText("۱۲۰ سند فاقد تاریخ سررسید هستند")).toBeVisible();
    expect(screen.getByRole("link",{name:"بررسی و تکمیل داده‌های ورودی"})).toHaveAttribute("href","/companies/company/data");
  });
  it("keeps ratios distinct from percentage units", () => {
    render(<MetricEvidenceDrawer open onOpenChange={vi.fn()} companyId="company" metric={{...metric,unit:"ratio",value_numeric:1.5}} />);
    expect(screen.getByText("۱٫۵")).toBeVisible();
    expect(screen.queryByText("مبلغ دقیق به ریال")).not.toBeInTheDocument();
  });
});
