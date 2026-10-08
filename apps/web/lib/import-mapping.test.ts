import { describe, expect, it } from "vitest";

import { buildTransforms, isRequiredField } from "./import-mapping";

describe("import mapping helpers", () => {
  it("creates explicit Jalali/money-safe transforms for toman input", () => {
    const transforms = buildTransforms({ entry_date: "تاریخ", debit: "بدهکار", description: "شرح" }, "toman");
    expect(transforms.entry_date).toEqual(["trim", "normalize_digits", "parse_date"]);
    expect(transforms.debit).toEqual(["trim", "normalize_digits", "strip_thousands", "toman_to_rial"]);
    expect(transforms.description).toEqual(["trim"]);
  });

  it("keeps direct requirements and does not require both alternative methods before selection", () => {
    expect(isRequiredField("booking_date", ["booking_date"], [["amount_signed"]])).toBe(true);
    expect(isRequiredField("amount_signed", ["booking_date"], [["amount_signed"]])).toBe(false);
    expect(isRequiredField("iban", ["booking_date"], [["amount_signed"]])).toBe(false);
  });

  const alternatives = [["amount_signed"], ["deposit_amount", "withdrawal_amount"]];

  it("accepts the signed amount without requiring deposit and withdrawal", () => {
    const mapping = { amount_signed: "مبلغ" };
    expect(isRequiredField("amount_signed", [], alternatives, mapping)).toBe(true);
    expect(isRequiredField("deposit_amount", [], alternatives, mapping)).toBe(false);
    expect(isRequiredField("withdrawal_amount", [], alternatives, mapping)).toBe(false);
  });

  it("requires both separate columns once that method is started", () => {
    const mapping = { deposit_amount: "واریز" };
    expect(isRequiredField("deposit_amount", [], alternatives, mapping)).toBe(true);
    expect(isRequiredField("withdrawal_amount", [], alternatives, mapping)).toBe(true);
    expect(isRequiredField("amount_signed", [], alternatives, mapping)).toBe(false);
  });

  it("accepts separate columns without a signed amount", () => {
    const mapping = { deposit_amount: "واریز", withdrawal_amount: "برداشت", amount_signed: " " };
    expect(isRequiredField("amount_signed", [], alternatives, mapping)).toBe(false);
    expect(isRequiredField("withdrawal_amount", [], alternatives, mapping)).toBe(true);
  });

  it("uses a complete method even if the other method is partially mapped", () => {
    const mapping = { amount_signed: "مبلغ", deposit_amount: "واریز" };
    expect(isRequiredField("withdrawal_amount", [], alternatives, mapping)).toBe(false);
  });
});
