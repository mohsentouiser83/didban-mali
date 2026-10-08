import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardFindingsReview } from "./dashboard-findings-review";
import { api } from "@/lib/product-api";
import type { DashboardFinding, EvidenceItem } from "@/lib/product-types";
vi.mock("@/lib/product-api", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);
const finding = (id: string): DashboardFinding => ({id, finding_code: "amount_mismatch" as DashboardFinding["finding_code"], title_fa: `یافته ${id}`, summary_fa:`توضیح ${id}`, priority_band:"high",priority_score:"80",priority_reasons:{},confidence_score:"90",affected_amount_irr:null,affected_ratio:null,workflow_status:"needs_review"});
const source = (type: string, value: unknown): EvidenceItem => ({id:type,ordinal:1,evidence_type:"source_record",claim_code:"source",source_entity_type:type,source_entity_id:null,source_row_id:null,source_file_id:null,field_snapshot:{normalized:{amount_irr:value},source_location:{row_number:7}},calculation:{},rule_code:null,rule_version:"1",created_at:"2026-10-08"});
beforeEach(() => mockedApi.mockReset());
describe("Dashboard findings evidence", () => {
  it("shows source evidence and leaves a missing counterpart unavailable", async () => {
    mockedApi.mockResolvedValue({items:[source("journal_entry","125000000")]});
    render(<DashboardFindingsReview companyId="company" findings={[finding("a")]} total={1} />);
    fireEvent.click(screen.getByText("شواهد و مقایسهٔ مبالغ"));
    expect(await screen.findByText("ردیف ۷")).toBeVisible();
    expect(screen.getByText("شاهد متناظر موجود نیست")).toBeVisible();
    expect(screen.getByRole("link",{name:/بررسی و ثبت تصمیم/})).toHaveAttribute("href","/companies/company/findings/a");
  });
  it("does not display late evidence from a previously selected finding", async () => {
    let resolveOld!: (value: {items:EvidenceItem[]}) => void;
    mockedApi.mockImplementationOnce(() => new Promise(resolve => {resolveOld=resolve;})).mockResolvedValueOnce({items:[source("bank_transaction","42000000")]});
    render(<DashboardFindingsReview companyId="company" findings={[finding("a"),finding("b")]} total={2} />);
    fireEvent.click(screen.getByRole("button",{name:/یافته b/}));
    fireEvent.click(screen.getByText("شواهد و مقایسهٔ مبالغ"));
    expect((await screen.findAllByText("تراکنش بانک"))[0]).toBeVisible();
    await act(async () => resolveOld({items:[source("journal_entry","999999999")]}));
    expect(screen.queryByText("۹۹۹٬۹۹۹٬۹۹۹")).not.toBeInTheDocument();
    expect(screen.getByRole("link",{name:/بررسی و ثبت تصمیم/})).toHaveAttribute("href","/companies/company/findings/b");
  });
  it("retries a failed evidence request", async () => {
    mockedApi.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({items:[]});
    render(<DashboardFindingsReview companyId="company" findings={[finding("a")]} total={1} />);
    fireEvent.click(screen.getByText("شواهد و مقایسهٔ مبالغ"));
    fireEvent.click(await screen.findByRole("button",{name:"تلاش دوباره"}));
    await waitFor(() => expect(mockedApi).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/شاهد عددی قابل‌مقایسه‌ای/)).toBeVisible();
  });
  it("explains a trend with its percentage and dates without inventing a cause", async () => {
    const trend = {...finding("trend"), finding_code:"profit_drop" as const, affected_ratio:"0.112700", summary_fa:"تغییر شاخص از آستانه نسخه‌دار موتور عبور کرده است."};
    mockedApi.mockResolvedValue({items:[{...source("current", "12313200000"), field_snapshot:{position:"current",value_irr:"12313200000"}}, {...source("previous", "13877120000"), field_snapshot:{position:"previous",value_irr:"13877120000"}}]});
    render(<DashboardFindingsReview companyId="company" findings={[trend]} total={1} currentPeriod="۱۷ شهریور تا ۱۵ مهر" comparisonPeriod="۱۸ مرداد تا ۱۶ شهریور" />);
    expect(screen.getByRole("button",{name:/کاهش سود ۱۱٫۳/})).toBeVisible();
    expect(screen.getByRole("link",{name:/بررسی و ثبت تصمیم/})).toBeVisible();
    fireEvent.click(screen.getByText("شواهد و مقایسهٔ مبالغ"));
    expect(await screen.findByText("۱۷ شهریور تا ۱۵ مهر")).toBeVisible();
    expect(screen.getByText("۱۸ مرداد تا ۱۶ شهریور")).toBeVisible();
    expect(screen.queryByText(/آستانه نسخه‌دار/)).not.toBeInTheDocument();
  });
  it("prevents opening a previous finding while a new period is loading", () => {
    mockedApi.mockResolvedValue({items:[]});
    render(<DashboardFindingsReview companyId="company" findings={[finding("a")]} total={1} switching />);
    expect(screen.getByRole("button",{name:/یافته a/})).toBeDisabled();
    const event = new MouseEvent("click", {bubbles:true,cancelable:true});
    screen.getByRole("link",{name:/بررسی و ثبت تصمیم/}).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

});
