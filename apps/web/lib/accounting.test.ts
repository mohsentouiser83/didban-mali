import { expect, it } from "vitest";
import {
  ACCOUNT_NATURE_OPTIONS,
  accountNatureLabel,
  draftFormValue,
  draftPayload,
  draftValidation,
  type DraftFormValue,
  type JournalDraft,
} from "./accounting";
function balanced(debit = "12000000"): DraftFormValue {
  return {
    period_id: "period-a",
    date: "2026-11-01",
    description: "هزینه خدمات",
    unit: "TOMAN",
    lines: [
      { account_id: "expense", party_id: "", debit, credit: "0" },
      { account_id: "bank", party_id: "", debit: "0", credit: debit },
    ],
  };
}
it("preserves exact large financial values and six decimal places without float arithmetic", () => {
  const value = balanced("9007199254740993.123456");
  const result = draftValidation(value);
  expect(result.errors).toEqual({});
  expect(result.totalDebit).toBe("9007199254740993.123456");
  expect(result.totalCredit).toBe(result.totalDebit);
  value.lines[1].credit = "9007199254740993.123455";
  expect(draftValidation(value).errors.balance).toBeTruthy();
});
it("rejects negative, dual-sided, empty and overprecision lines", () => {
  for (const [debit, credit] of [
    ["-1", "0"],
    ["1", "1"],
    ["", ""],
    ["1.1234567", "0"],
  ]) {
    const value = balanced();
    value.lines[0] = { ...value.lines[0], debit, credit };
    expect(draftValidation(value).errors["line-0-debit"]).toBeTruthy();
  }
});
it("reopens a draft in IRR using canonical rial values and sends only editable fields", () => {
  const draft: JournalDraft = {
    ...balanced(),
    id: "draft-a",
    original_unit: "TOMAN",
    version: 3,
    state: "draft",
    lines: balanced().lines.map((line) => ({
      ...line,
      original_debit: line.debit,
      original_credit: line.credit,
      debit: line.debit === "0" ? "0" : "120000000",
      credit: line.credit === "0" ? "0" : "120000000",
    })),
  };
  const value = draftFormValue(draft);
  expect(value.unit).toBe("IRR");
  expect(value.lines[0].debit).toBe("120000000");
  expect(draftPayload(value)).toEqual({
    ...balanced("120000000"),
    unit: "IRR",
  });
  expect(draftPayload(value).lines[0]).not.toHaveProperty("original_debit");
});
it("requires explicit period, date, account and nonblank description", () => {
  const value = draftFormValue();
  value.description = "   ";
  const { errors } = draftValidation(value);
  expect(errors["draft-period"]).toBeTruthy();
  expect(errors["draft-date"]).toBeTruthy();
  expect(errors["draft-description"]).toBeTruthy();
  expect(errors["line-0-account"]).toBeTruthy();
});
it("provides correct account nature labels and valid options list", () => {
  expect(ACCOUNT_NATURE_OPTIONS).toHaveLength(4);
  expect(ACCOUNT_NATURE_OPTIONS.map((opt) => opt.value)).toEqual([
    "debit",
    "credit",
    "floating",
    "none",
  ]);
  expect(accountNatureLabel("debit")).toBe("بدهکار");
  expect(accountNatureLabel("credit")).toBe("بستانکار");
  expect(accountNatureLabel("floating")).toBe("شناور (دوگانه)");
  expect(accountNatureLabel("none")).toBe("فاقد ماهیت / انتظامی");
  expect(accountNatureLabel()).toBe("بدهکار");
});
