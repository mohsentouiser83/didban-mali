import { describe, expect, it } from "vitest";
import { formatApiError } from "./product-api";
describe("product API error text", () => {
  it("preserves a human-readable service error", () =>
    expect(formatApiError("دوره مالی موجود نیست", 404)).toBe(
      "دوره مالی موجود نیست",
    ));
  it("does not show a validation array as object Object", () =>
    expect(
      formatApiError(
        [
          {
            loc: ["query", "limit"],
            msg: "Input should be less than or equal to 100",
          },
        ],
        422,
      ),
    ).toContain("مقادیر و بازه"));
  it("uses a structured message without dumping internal fields", () =>
    expect(
      formatApiError({ message: "دسترسی مجاز نیست", trace: "internal" }, 403),
    ).toBe("دسترسی مجاز نیست"));
  it("gives an actionable fallback for an unavailable service", () =>
    expect(formatApiError(null, 503)).toContain("دوباره تلاش کنید"));
});
