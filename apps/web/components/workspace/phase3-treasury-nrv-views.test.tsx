import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommercialDocumentsPanel } from "./commercial/commercial-documents-panel";
import { InventoryNrvDrawer } from "./inventory-nrv-drawer";
import { TreasuryDocumentsPanel } from "./treasury-documents-panel";

vi.mock("@/hooks/workspace", () => ({
  useWorkspace: () => ({
    company: { id: "co-1", name: "شرکت نمونه", role: "finance_manager" },
    periodId: "p-1",
    canWrite: true,
    unit: "IRR",
    companyPath: (path: string) => `/companies/co-1/${path}`,
  }),
}));

vi.mock("@/hooks/use-resource", () => ({
  useResource: (url: string | null) => {
    if (!url) return { data: null, loading: false, error: null, refresh: vi.fn() };
    if (url.includes("nrv-assessment")) {
      return {
        data: {
          standard: "Iranian Accounting Standard No. 8 (LCNRV)",
          method: "allowance_contra_asset",
          as_of: "2026-06-30",
          total_cost_irr: "6000",
          total_lcnrv_irr: "4500",
          total_write_down_irr: "1500",
          total_reversible_irr: "0",
          policy_status: "approved_allowance_draft_only",
          financial_effect: false,
          rows: [
            {
              item_id: "i-1",
              item_name: "کالای نمونه",
              warehouse_id: "w-1",
              warehouse_name: "انبار مرکزی",
              quantity: 3,
              total_value_irr: "6000",
              nrv_status: "write_down_required",
              nrv_unit_irr: "1500",
              nrv_total_irr: "4500",
              lcnrv_value_irr: "4500",
              write_down_irr: "1500",
              reversible_irr: "0",
            },
          ],
        },
        loading: false,
        error: null,
        refresh: vi.fn(),
      };
    }
    if (url.includes("commercial/documents")) {
      return {
        data: {
          total: 1,
          items: [
            {
              id: "cd-1",
              number: "CD-1405-001",
              direction: "sale",
              status: "posted",
              issue_date: "2026-05-10",
              due_date: null,
              counterparty_id: "cp-1",
              party_snapshot: { name: "خریدار افق" },
              gross_amount_irr: "4000",
              line_discount_total_irr: "0",
              invoice_discount_irr: "100",
              net_amount_irr: "3900",
              settlement_type: "on_account",
              draft_id: null,
              lines: [
                {
                  id: "cdl-1",
                  line_index: 0,
                  line_kind: "goods",
                  item_id: "i-1",
                  description: "کالای نمونه",
                  unit: "عدد",
                  quantity: 2,
                  unit_price_irr: "2000",
                  line_discount_irr: "0",
                  allocated_invoice_discount_irr: "100",
                  net_amount_irr: "3900",
                  remaining_returnable_qty: 2,
                },
              ],
            },
          ],
        },
        loading: false,
        error: null,
        refresh: vi.fn(),
      };
    }
    if (url.includes("treasury/documents")) {
      return {
        data: {
          items: [
            {
              id: "td-1",
              direction: "receipt",
              number: "REC-001",
              date: "2026-05-12",
              counterparty_id: "cp-1",
              total_amount: "500000",
              description: "دریافت حواله",
              state: "draft",
              version: 1,
              tools: [
                {
                  id: "tl-1",
                  line_index: 0,
                  tool_kind: "bank_transfer",
                  treasury_account_id: "ta-1",
                  amount: "500000",
                  reference: "TR-123",
                  due_date: null,
                },
              ],
              allocations: [],
            },
          ],
        },
        loading: false,
        error: null,
        refresh: vi.fn(),
      };
    }
    return { data: { items: [] }, loading: false, error: null, refresh: vi.fn() };
  },
}));

describe("New audit remediation web panels (LCNRV D35, Commercial Docs, Treasury Docs)", () => {
  it("renders Standard 8 NRV drawer rows and allowance draft CTA", () => {
    render(
      <InventoryNrvDrawer
        open
        onOpenChange={vi.fn()}
        accounts={[{ value: "acc-1", label: "۱۱۰۹ — ذخیره" }]}
      />,
    );
    expect(screen.getByText(/ارزیابی کاهش ارزش موجودی/)).toBeInTheDocument();
    expect(screen.getByText("کالای نمونه")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /تهیه پیش‌نویس ذخیره/ })).toBeInTheDocument();
  });

  it("renders multi-line commercial documents panel with return and quarantine/credit tabs", () => {
    render(<CommercialDocumentsPanel direction="sale" />);
    expect(screen.getByText("CD-1405-001")).toBeInTheDocument();
    expect(screen.getByText("خریدار افق")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /قرنطینه معیوب/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /اعتبار طرف‌حساب/ })).toBeInTheDocument();
  });

  it("renders treasury documents panel and tool allocation action", () => {
    render(<TreasuryDocumentsPanel />);
    expect(screen.getByText("REC-001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ثبت پیش‌نویس سند خزانه/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /تخصیص به فاکتور/ })).toBeInTheDocument();
  });
});
