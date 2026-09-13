import { describe, expect, it } from "vitest";

import { buildTransforms, isRequiredField } from "./import-mapping";

describe("import mapping helpers", () => {
  it("creates explicit Jalali/money-safe transforms for toman input", () => {
    const transforms = buildTransforms({ entry_date: "تاریخ", debit: "بدهکار", description: "شرح" }, "toman");
    expect(transforms.entry_date).toEqual(["trim", "normalize_digits", "parse_date"]);
    expect(transforms.debit).toEqual(["trim", "normalize_digits", "strip_thousands", "toman_to_rial"]);
    expect(transforms.description).toEqual(["trim"]);
  });

  it("marks direct and alternative financial fields as required", () => {
    expect(isRequiredField("booking_date", ["booking_date"], [["amount_signed"]])).toBe(true);
    expect(isRequiredField("amount_signed", ["booking_date"], [["amount_signed"]])).toBe(true);
    expect(isRequiredField("iban", ["booking_date"], [["amount_signed"]])).toBe(false);
  });
});
