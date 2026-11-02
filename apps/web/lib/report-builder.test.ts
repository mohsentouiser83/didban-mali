import { expect, it } from "vitest";
import { reportCell } from "./report-builder";
it("keeps unavailable distinct from real zero and formats exact large monetary strings", () => {
  expect(reportCell({ remaining: null }, "remaining")).toBe("ناموجود");
  expect(reportCell({ remaining: "0" }, "remaining")).toBe("۰");
  expect(reportCell({ amount: "90071992547409930001" }, "amount")).toBe("۹۰٬۰۷۱٬۹۹۲٬۵۴۷٬۴۰۹٬۹۳۰٬۰۰۱");
});
