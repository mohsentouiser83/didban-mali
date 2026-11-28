import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useInvoiceList } from "./use-invoice-list";

vi.mock("./use-native-invoices", () => ({
  useNativeInvoices: () => ({
    workspace: { company: { id: "company" } },
    report: {
      data: {
        items: [
          { id: "native-linked", commercial_document_id: "commercial", reference: "F-1", party_id: "customer", terms: null },
          { id: "native-other", reference: "F-2", party_id: "customer", terms: null, date: "2026-11-03", amount: "50", remaining: null, status: "unavailable" },
        ],
      },
    },
  }),
}));

vi.mock("./use-commercial-documents", () => ({
  docStatusLabel: { posted: "ثبت‌شده" },
  useCommercialDocuments: () => ({
    docRows: [
      { id: "commercial", number: "F-1", counterparty_id: "customer", issue_date: "2026-11-02", net_amount_irr: "70", open_balance_irr: "30", status: "posted" },
    ],
    cpNames: { customer: "طرف حساب آزمایشی" },
  }),
}));

vi.mock("./use-financial-view", () => ({
  useFinancialView: () => ({
    manifest: {
      details: {
        invoices: [
          { id: "imported-sale", direction: "sales", reference: "F-1", party_id: "customer", date: "2026-11-01", amount: "70", remaining: "30" },
          { id: "imported-purchase", direction: "purchases", reference: "P-1", party_id: "supplier", date: "2026-11-01", amount: "70", remaining: "30" },
        ],
      },
    },
  }),
}));

it("shows explicitly linked invoices together and preserves imported evidence with the same reference", () => {
  const { result } = renderHook(() => useInvoiceList("sales"));
  expect(result.current.rows.map((row) => row.id)).toEqual([
    "native:native-other", "commercial:commercial", "imported:imported-sale",
  ]);
  expect(result.current.rows[0]).toMatchObject({ balance: null, status: "نامشخص" });
  expect(result.current.rows[1]).toMatchObject({
    balance: "30",
    source: { kind: "commercial", native: { id: "native-linked" } },
  });
});
