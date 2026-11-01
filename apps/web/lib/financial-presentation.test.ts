import { it, expect } from "vitest";
import {
  addExactAmounts,
  invoiceFinancialState,
} from "./financial-presentation";
import type { InvoiceDetail } from "./api";
const invoice: InvoiceDetail = {
  id: "i",
  reference: "INV-1",
  party_id: "p",
  date: "2026-09-01",
  amount: "100",
  remaining: "0",
  direction: "sales",
  status: "available",
};
it("shows settlement state independently of source coverage and never treats missing as settled", () => {
  expect(invoiceFinancialState(invoice)).toBe("settled");
  expect(
    invoiceFinancialState({
      ...invoice,
      remaining: "0.000000",
      status: "limited",
    }),
  ).toBe("settled");
  expect(invoiceFinancialState({ ...invoice, remaining: "0.000001" })).toBe(
    "open",
  );
  expect(invoiceFinancialState({ ...invoice, remaining: null })).toBe(
    "unavailable",
  );
  expect(
    invoiceFinancialState({ ...invoice, remaining: "20", overdue: true }),
  ).toBe("overdue");
  expect(invoiceFinancialState({ ...invoice, remaining: "-20" })).toBe(
    "credit",
  );
});
it("combines legacy bank-flow components without losing precision or treating missing as zero", () => {
  expect(addExactAmounts("12345678901234567890.123456", "200.000004")).toBe(
    "12345678901234568090.12346",
  );
  expect(addExactAmounts("0", "0")).toBe("0");
  expect(addExactAmounts("12", null)).toBeNull();
});
