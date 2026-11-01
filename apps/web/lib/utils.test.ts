import { describe, expect, it } from "vitest";
import { amount } from "./utils";
describe("exact financial presentation", () => {
  it("keeps monetary digits beyond JavaScript safe integers", () => {
    expect(amount("123456789012345678901234567890.123456")).toBe(
      "۱۲۳٬۴۵۶٬۷۸۹٬۰۱۲٬۳۴۵٬۶۷۸٬۹۰۱٬۲۳۴٬۵۶۷٬۸۹۰٫۱۲۳۴۵۶",
    );
  });
  it("converts display rial to toman with exact decimals", () => {
    expect(amount("1234", "TOMAN")).toBe("۱۲۳٫۴");
    expect(amount("-1.000001", "TOMAN")).toBe("−۰٫۱۰۰۰۰۰۱");
  });
  it("distinguishes missing data from a real zero", () => {
    expect(amount(null)).toBe("—");
    expect(amount("0")).toBe("۰");
  });
});
