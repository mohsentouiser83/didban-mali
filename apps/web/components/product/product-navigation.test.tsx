import { expect, it } from "vitest";
import { isProductItemActive, productNavigation, productSectionNavigation } from "./product-navigation";
const base = "/companies/example";
it("keeps the main pages and document upload and no deleted destination", () => {
  const navigation = productNavigation(base);
  const items = [...navigation.primary, ...navigation.secondary].flatMap((group) => group.items);
  expect(items.map((item) => item.href)).toEqual(["overview", "cashflow", "receivables", "payables", "findings", "imports", "reports"].map((path) => `${base}/${path}`));
});
it.each(["scenarios", "actions", "reconciliation", "reports/analysis"])("does not attach deleted %s to another section", (path) => {
  expect(productSectionNavigation(`${base}/${path}`, base)).toBeNull();
  expect(isProductItemActive(`${base}/${path}`, `${base}/findings`, base)).toBe(false);
  expect(isProductItemActive(`${base}/${path}`, `${base}/cashflow`, base)).toBe(false);
});
it("only highlights the current company and exact route prefix", () => {
  expect(isProductItemActive(`${base}/findings`, `${base}/findings`, base)).toBe(true);
  expect(isProductItemActive("/companies/other/findings", `${base}/findings`, base)).toBe(false);
  expect(isProductItemActive(`${base}/findings-archive`, `${base}/findings`, base)).toBe(false);
});
