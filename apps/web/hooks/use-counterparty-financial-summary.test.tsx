import { renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useCounterpartyFinancialSummary } from "./use-counterparty-financial-summary";

vi.mock("./workspace", () => ({
  useWorkspace: () => ({
    unit: "IRR",
    companyPath: (path: string) => `/companies/c/${path}`,
  }),
}));
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("@/lib/api")>()), api: vi.fn() }));

it("reads the native ledger by party and keeps unknown invoice totals unavailable", async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    path.includes("statement-ledger")
      ? { totals: { entry_count: 2, net_balance: "15" } }
      : { items: [
          { direction: "sale", remaining: "9007199254740993.125" },
          { direction: "sale", remaining: "0.375" },
          { direction: "purchase", remaining: "12" },
          { direction: "purchase", remaining: null },
        ] },
  );
  const { result } = renderHook(() => useCounterpartyFinancialSummary("party-1", true));
  await waitFor(() => expect(result.current.sale.remaining).toBe("9007199254740993.5"));
  expect(result.current.purchase).toEqual({ count: 2, remaining: null, unknownCount: 1 });
  expect(api).toHaveBeenCalledWith(
    expect.stringContaining("/counterparties/party-1/statement-ledger?basis=native&as_of_date="),
    expect.anything(),
  );
  expect(api).toHaveBeenCalledWith(
    expect.stringContaining("/accounting/native-invoices?counterparty_id=party-1&as_of="),
    expect.anything(),
  );
});
