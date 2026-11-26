import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jalaliToIso } from "@/lib/date-utils";
import { CommercialDocumentsPanel } from "./commercial/commercial-documents-panel";
import { TreasuryDocumentsPanel } from "./treasury-documents-panel";

vi.mock("@/hooks/workspace", () => ({
  useWorkspace: () => ({
    company: { id: "c1", name: "شرکت آزمایشی", role: "finance_manager", version: 1, approve_financial_report: true },
    periodId: "p-1",
    periods: [{ id: "p-1", name: "۱۴۰۵", start: "2026-01-01", end: "2026-12-29", version: 1 }],
    canWrite: true,
    unit: "IRR",
    companyPath: (path: string) => `/companies/c1/${path}`,
  }),
}));

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function selectOption(triggerName: RegExp | string, optionName: RegExp | string) {
  const trigger = screen.getByRole("combobox", { name: triggerName });
  fireEvent.keyDown(trigger, { key: "Enter" });
  const option = screen.getByRole("option", { name: optionName });
  fireEvent.click(option);
}

describe("Commercial multi-line invoice draft & Treasury allocation reversal regressions", () => {
  let fetchCalls: FetchCall[] = [];

  beforeEach(() => {
    fetchCalls = [];
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function installFetchMock(handler: (url: string, method: string, headers: Record<string, string>, body?: Record<string, unknown>) => Response | Promise<Response>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || "GET";
        const headers = (init?.headers as Record<string, string>) || {};
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
        fetchCalls.push({ url, method, headers, body });
        return handler(url, method, headers, body);
      }),
    );
  }

  function baseCommercialHandler(accountsList: Array<{ id: string; code: string; name: string; role: string | null }>) {
    return (url: string, method: string) => {
      if (url.includes("/commercial/documents") && method === "GET") {
        return jsonResponse({ total: 0, items: [] });
      }
      if (url.includes("/commercial/quarantine")) {
        return jsonResponse({ items: [] });
      }
      if (url.includes("/commercial/credits")) {
        return jsonResponse({ items: [] });
      }
      if (url.includes("/commercial/counterparties")) {
        return jsonResponse({
          items: [
            { id: "cp-cust", code: "C01", name: "مشتری نمونه", type: "customer", active: true, version: 1 },
            { id: "cp-supp", code: "S01", name: "تأمین‌کننده نمونه", type: "supplier", active: true, version: 1 },
          ],
        });
      }
      if (url.includes("/accounting/inventory")) {
        return jsonResponse({
          items: [
            {
              id: "item-1",
              code: "ITM-1",
              name: "کالای تست",
              inventory_account_id: "acc-inv",
              base_unit: "عدد",
              item_kind: "goods",
              active: true,
              version: 1,
            },
          ],
          warehouses: [
            { id: "wh-1", code: "WH-1", name: "انبار مرکزی", active: true, version: 1 },
          ],
          balances: [],
          movements: [],
          can_prepare: true,
          can_manage_catalog: true,
          purchase_enabled: true,
          sale_enabled: true,
          movements_truncated: false,
        });
      }
      if (url.includes("/accounting/accounts")) {
        return jsonResponse({
          items: accountsList.map((a) => ({
            ...a,
            nature: "debit",
            level: "detail",
            has_children: false,
            postable: true,
            active: true,
            version: 1,
          })),
          next_cursor: null,
        });
      }
      if (url.includes("/commercial/documents") && method === "POST") {
        return jsonResponse({
          document: {
            id: "doc-new",
            number: "CD-1",
            direction: "sale",
            status: "draft",
            issue_date: "2026-05-10",
            due_date: null,
            counterparty_id: "cp-cust",
            gross_amount_irr: "100000",
            line_discount_total_irr: "0",
            invoice_discount_irr: "0",
            net_amount_irr: "100000",
            settlement_type: "on_account",
            draft_id: "draft-1",
            lines: [],
          },
          financial_effect: false,
        }, 201);
      }
      return jsonResponse({ items: [] });
    };
  }

  it("sends service_revenue_account_id and counterparty_account_id for service sale and handles ambiguous revenue accounts", async () => {
    installFetchMock(
      baseCommercialHandler([
        { id: "acc-ar", code: "12010101", name: "مطالبات تجاری", role: "trade_receivable" },
        { id: "acc-rev-1", code: "41010101", name: "درآمد فروش کالا", role: "revenue" },
        { id: "acc-rev-2", code: "41010201", name: "درآمد خدمات مشاوره", role: "revenue" },
      ]),
    );

    render(<CommercialDocumentsPanel direction="sale" />);
    fireEvent.click(await screen.findByRole("button", { name: /ثبت فاکتور .*چندردیفی/ }));

    // Wait for accounts to load
    await waitFor(() => {
      expect(fetchCalls.some((c) => c.url.includes("/accounting/accounts"))).toBe(true);
    });

    // Switch line 1 to service
    selectOption("نوع ردیف 1", "خدمت");
    selectOption(/^طرف حساب$/, /مشتری نمونه/);
    fireEvent.change(screen.getByLabelText("شرح ردیف 1"), { target: { value: "مشاوره مالی" } });
    fireEvent.change(screen.getByLabelText("فی ردیف 1"), { target: { value: "500000" } });

    // Submit without selecting service revenue account (ambiguous: 2 revenue accounts!) -> inline error
    fireEvent.click(screen.getByRole("button", { name: "ساخت پیش‌نویس فاکتور تجاری" }));
    expect(await screen.findByText("حساب درآمد خدمات را انتخاب کنید.")).toBeInTheDocument();
    expect(fetchCalls.some((c) => c.url.endsWith("/commercial/documents") && c.method === "POST")).toBe(false);

    // Explicitly pick service revenue account and submit
    selectOption(/حساب درآمد خدمات/, /درآمد خدمات مشاوره/);
    fireEvent.click(screen.getByRole("button", { name: "ساخت پیش‌نویس فاکتور تجاری" }));

    await waitFor(() => {
      const post = fetchCalls.find((c) => c.url.endsWith("/commercial/documents") && c.method === "POST");
      expect(post).toBeDefined();
      expect(post!.body).toMatchObject({
        direction: "sale",
        party_id: "cp-cust",
        warehouse_id: null,
        settlement_type: "on_account",
        counterparty_account_id: "acc-ar",
        service_revenue_account_id: "acc-rev-2",
        lines: [
          {
            line_kind: "service",
            item_id: null,
            description: "مشاوره مالی",
            quantity: 1,
            unit_price: "500000",
            line_discount: "0",
          },
        ],
      });
    });
  });

  it("sends expense_account_id and cash_account_id for cash service purchase", async () => {
    installFetchMock(
      baseCommercialHandler([
        { id: "acc-bank", code: "11010101", name: "بانک ملت", role: "bank" },
        { id: "acc-exp", code: "51010101", name: "هزینه خدمات", role: "expense" },
      ]),
    );

    render(<CommercialDocumentsPanel direction="purchase" />);
    fireEvent.click(await screen.findByRole("button", { name: /ثبت فاکتور .*چندردیفی/ }));

    await waitFor(() => {
      expect(fetchCalls.some((c) => c.url.includes("/accounting/accounts"))).toBe(true);
    });

    selectOption("نوع ردیف 1", "خدمت");
    selectOption(/^طرف حساب$/, /تأمین‌کننده نمونه/);
    selectOption(/نحوه تسویه/, "نقدی کامل");
    fireEvent.change(screen.getByLabelText("شرح ردیف 1"), { target: { value: "حمل و نقل" } });
    fireEvent.change(screen.getByLabelText("فی ردیف 1"), { target: { value: "250000" } });

    fireEvent.click(screen.getByRole("button", { name: "ساخت پیش‌نویس فاکتور تجاری" }));

    await waitFor(() => {
      const post = fetchCalls.find((c) => c.url.endsWith("/commercial/documents") && c.method === "POST");
      expect(post).toBeDefined();
      expect(post!.body).toMatchObject({
        direction: "purchase",
        party_id: "cp-supp",
        warehouse_id: null,
        settlement_type: "cash",
        expense_account_id: "acc-exp",
        cash_account_id: "acc-bank",
        lines: [
          {
            line_kind: "service",
            item_id: null,
            description: "حمل و نقل",
            quantity: 1,
            unit_price: "250000",
          },
        ],
      });
      expect(post!.body).not.toHaveProperty("counterparty_account_id");
    });
  });

  it("validates mixed settlement shares & cheque info and sends complete goods sale payload", async () => {
    installFetchMock(
      baseCommercialHandler([
        { id: "acc-inv", code: "11030101", name: "موجودی کالا", role: "other_asset" },
        { id: "acc-chq", code: "11040101", name: "اسناد دریافتنی", role: "other_asset" },
        { id: "acc-bank", code: "11010101", name: "بانک سامان", role: "bank" },
        { id: "acc-ar", code: "12010101", name: "مطالبات تجاری", role: "trade_receivable" },
        { id: "acc-rev", code: "41010101", name: "فروش کالا", role: "revenue" },
        { id: "acc-cogs", code: "51010101", name: "بهای تمام‌شده", role: "expense" },
      ]),
    );

    render(<CommercialDocumentsPanel direction="sale" />);
    fireEvent.click(await screen.findByRole("button", { name: /ثبت فاکتور .*چندردیفی/ }));

    await waitFor(() => {
      expect(fetchCalls.some((c) => c.url.includes("/accounting/accounts"))).toBe(true);
    });

    selectOption(/^طرف حساب$/, /مشتری نمونه/);
    selectOption("کالای ردیف 1", /کالای تست/);
    fireEvent.change(screen.getByLabelText("تعداد ردیف 1"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("فی ردیف 1"), { target: { value: "100000" } });
    selectOption(/نحوه تسویه/, /ترکیبی/);

    // Intentionally mismatched shares: 50,000 + 50,000 + 20,000 != 200,000
    fireEvent.change(screen.getByLabelText(/مبلغ نقد/), { target: { value: "50000" } });
    fireEvent.change(screen.getByLabelText(/مبلغ چک/), { target: { value: "50000" } });
    fireEvent.change(screen.getByLabelText(/مبلغ نسیه/), { target: { value: "20000" } });

    fireEvent.click(screen.getByRole("button", { name: "ساخت پیش‌نویس فاکتور تجاری" }));
    expect(await screen.findByText(/مجموع سهم‌های نقد، چک و نسیه/)).toBeInTheDocument();
    expect(screen.getByText(/شماره چک برای بخش تسویه با چک الزامی است/)).toBeInTheDocument();
    expect(fetchCalls.some((c) => c.url.endsWith("/commercial/documents") && c.method === "POST")).toBe(false);

    // Fix shares to 50,000 + 50,000 + 100,000 = 200,000 and enter cheque details
    fireEvent.change(screen.getByLabelText(/مبلغ نسیه/), { target: { value: "100000" } });
    fireEvent.change(screen.getByLabelText(/شماره چک/), { target: { value: "CHK-991" } });
    const chequeDateInput = document.getElementById("cd-cheque-due-date") as HTMLInputElement;
    fireEvent.change(chequeDateInput, { target: { value: "1405/04/09" } });

    // Pick cheque account if not auto-selected, or verify it auto-selected acc-chq (excluding acc-inv!)
    fireEvent.click(screen.getByRole("button", { name: "ساخت پیش‌نویس فاکتور تجاری" }));

    await waitFor(() => {
      const post = fetchCalls.find((c) => c.url.endsWith("/commercial/documents") && c.method === "POST");
      expect(post).toBeDefined();
      expect(post!.body).toMatchObject({
        direction: "sale",
        party_id: "cp-cust",
        warehouse_id: "wh-1",
        settlement_type: "mixed",
        cash_amount: "50000",
        cheque_amount: "50000",
        on_account_amount: "100000",
        cheque_number: "CHK-991",
        cheque_due_date: jalaliToIso("1405/04/09"),
        revenue_account_id: "acc-rev",
        cost_account_id: "acc-cogs",
        cash_account_id: "acc-bank",
        cheque_account_id: "acc-chq",
        counterparty_account_id: "acc-ar",
      });
    });
  });

  it("reverses treasury allocation using parent document version in If-Match and updates UI state", async () => {
    let currentDoc: {
      id: string;
      direction: string;
      number: string;
      date: string;
      counterparty_id: string;
      total_amount: string;
      description: string;
      state: string;
      version: number;
      tools: Array<{
        id: string;
        line_index: number;
        tool_kind: string;
        treasury_account_id: string;
        amount: string;
        reference: string | null;
        due_date: string | null;
      }>;
      allocations: Array<{
        id: string;
        tool_line_id: string;
        invoice_id: string;
        amount: string;
        date: string;
        actor_id: string;
        reversed_at: string | null;
        reversed_by: string | null;
        reversal_reason: string | null;
      }>;
    } = {
      id: "td-1",
      direction: "receipt",
      number: "REC-001",
      date: "2026-05-12",
      counterparty_id: "cp-1",
      total_amount: "500000",
      description: "دریافت حواله",
      state: "draft",
      version: 3,
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
      allocations: [
        {
          id: "alloc-1",
          tool_line_id: "tl-1",
          invoice_id: "inv-1",
          amount: "300000",
          date: "2026-05-12",
          actor_id: "u-1",
          reversed_at: null,
          reversed_by: null,
          reversal_reason: null,
        },
      ],
    };

    installFetchMock((url, method, headers, body) => {
      if (url.includes("/treasury/documents") && method === "GET") {
        return jsonResponse({ items: [currentDoc] });
      }
      if (url.includes("/treasury/allocations/alloc-1/reverse") && method === "POST") {
        expect(headers["If-Match"]).toBe("3");
        expect(body).toEqual({ reason: "اصلاح تخصیص" });
        currentDoc = {
          ...currentDoc,
          version: 4,
          allocations: [
            {
              ...currentDoc.allocations[0],
              reversed_at: "2026-05-13T10:00:00Z",
              reversed_by: "u-1",
              reversal_reason: "اصلاح تخصیص",
            },
          ],
        };
        return jsonResponse(currentDoc);
      }
      return jsonResponse({ items: [] });
    });

    render(<TreasuryDocumentsPanel />);
    const reverseBtn = await screen.findByRole("button", { name: /برگشت/ });
    fireEvent.click(reverseBtn);

    fireEvent.change(screen.getByLabelText(/دلیل برگشت/), { target: { value: "اصلاح تخصیص" } });
    fireEvent.click(screen.getByRole("button", { name: "ثبت برگشت" }));

    await waitFor(() => {
      const post = fetchCalls.find((c) => c.url.includes("/treasury/allocations/alloc-1/reverse"));
      expect(post).toBeDefined();
      expect(post!.headers["If-Match"]).toBe("3");
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByText("برگشت‌شده")).toBeInTheDocument();
    });
  });

  it("shows clear refresh guidance on stale parent version (409) and never auto-retries", async () => {
    installFetchMock((url, method) => {
      if (url.includes("/treasury/documents") && method === "GET") {
        return jsonResponse({
          items: [
            {
              id: "td-2",
              direction: "receipt",
              number: "REC-002",
              date: "2026-05-12",
              counterparty_id: "cp-1",
              total_amount: "500000",
              description: "دریافت",
              state: "draft",
              version: 5,
              tools: [
                {
                  id: "tl-2",
                  line_index: 0,
                  tool_kind: "bank_transfer",
                  treasury_account_id: "ta-1",
                  amount: "500000",
                  reference: null,
                  due_date: null,
                },
              ],
              allocations: [
                {
                  id: "alloc-2",
                  tool_line_id: "tl-2",
                  invoice_id: "inv-1",
                  amount: "200000",
                  reversed_at: null,
                },
              ],
            },
          ],
        });
      }
      if (url.includes("/treasury/allocations/alloc-2/reverse") && method === "POST") {
        return jsonResponse(
          { code: "version_conflict", message_fa: "اطلاعات تغییر کرده؛ صفحه را تازه کنید." },
          409,
        );
      }
      return jsonResponse({ items: [] });
    });

    render(<TreasuryDocumentsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /برگشت/ }));
    fireEvent.change(screen.getByLabelText(/دلیل برگشت/), { target: { value: "تغییر نسخه" } });
    fireEvent.click(screen.getByRole("button", { name: "ثبت برگشت" }));

    expect(
      await screen.findByText(/نسخهٔ سند خزانه تغییر کرده و اطلاعات بازشده قدیمی است/),
    ).toBeInTheDocument();

    const reverseCalls = fetchCalls.filter((c) => c.url.includes("/treasury/allocations/alloc-2/reverse"));
    expect(reverseCalls).toHaveLength(1);
    expect(reverseCalls[0].headers["If-Match"]).toBe("5");
    expect(screen.getByRole("button", { name: "ثبت برگشت" })).toBeDisabled();

    const getCountBefore = fetchCalls.filter((c) => c.url.includes("/treasury/documents") && c.method === "GET").length;
    fireEvent.click(screen.getByRole("button", { name: "بازخوانی و بازبینی اسناد" }));

    await waitFor(() => {
      const getCountAfter = fetchCalls.filter((c) => c.url.includes("/treasury/documents") && c.method === "GET").length;
      expect(getCountAfter).toBeGreaterThan(getCountBefore);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
