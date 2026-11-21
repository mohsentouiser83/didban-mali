import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useCounterpartyReconciliation } from "./use-counterparty-reconciliation";

const workspace = vi.hoisted(() => ({
  company: { id: "company-a" },
  canWrite: true,
  unit: "IRR" as const,
  companyPath: (resource: string) => `/companies/${workspace.company.id}/${resource}`,
}));

vi.mock("./workspace", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  api: vi.fn(),
}));

beforeEach(() => {
  workspace.company = { id: "company-a" };
  workspace.canWrite = true;
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({
    items: [
      {
        id: "cp-1",
        code: "CUST-001",
        name: "مشتری نمونه",
        transaction_count: 5,
        debit_total: "1000000",
        credit_total: "400000",
        current_balance: "600000",
        direction: "debtor",
      },
    ],
  });
});

it("loads candidates and handles statement parsing and row management", async () => {
  const { result } = renderHook(() => useCounterpartyReconciliation());

  await waitFor(() => expect(result.current.candidates.loading).toBe(false));
  expect(result.current.candidates.data?.items).toHaveLength(1);
  expect(result.current.candidates.data?.items[0].name).toBe("مشتری نمونه");

  // Select counterparty
  act(() => {
    result.current.setSelectedPartyId("cp-1");
  });
  expect(result.current.selectedPartyId).toBe("cp-1");

  // Parse pasted table from Excel
  act(() => {
    result.current.parsePastedTable(
      "1403/05/10\tINV-101\t1000000\t0\tفاکتور فروش\n1403/05/15\tPAY-201\t0\t400000\tحواله بانکی",
    );
  });

  expect(result.current.statementRows).toHaveLength(2);
  expect(result.current.statementRows[0].reference).toBe("INV-101");
  expect(result.current.statementRows[0].debit).toBe("1000000");
  expect(result.current.statementRows[1].reference).toBe("PAY-201");
  expect(result.current.statementRows[1].credit).toBe("400000");

  // Add manual row
  act(() => {
    result.current.addManualRow({
      date: "1403/05/20",
      reference: "INV-103",
      debit: "500000",
      credit: "0",
      description: "تست دستی",
    });
  });
  expect(result.current.statementRows).toHaveLength(3);

  // Remove row
  act(() => {
    result.current.removeRow(2);
  });
  expect(result.current.statementRows).toHaveLength(2);

  // Clear rows
  act(() => {
    result.current.clearRows();
  });
  expect(result.current.statementRows).toHaveLength(0);
});
