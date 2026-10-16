import { expect, it } from "vitest";
import { formatFinancialNumber, formatMoneyTooltip } from "./financial-format";

it("keeps a large integer and its fractional-toman equivalent exact in the hint", () => {
  expect(formatMoneyTooltip("9007199254740993123", "ریال")).toBe("۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳٬۱۲۳ ریال (۹۰۰٬۷۱۹٬۹۲۵٬۴۷۴٬۰۹۹٬۳۱۲٫۳ تومان)");
  expect(formatFinancialNumber(BigInt("9007199254740993123"))).toBe("۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳٬۱۲۳");
});

it("does not round or invent a converted value for fractional rials", () => {
  expect(formatMoneyTooltip("123.45", "IRR")).toBe("۱۲۳٫۴۵ ریال");
  expect(formatMoneyTooltip("0", "ریال")).toBe("۰ ریال (۰ تومان)");
});
