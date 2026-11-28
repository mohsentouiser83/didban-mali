import { describe, expect, it } from "vitest";
import { canViewPath, visibleAccessModules } from "./module-access";

describe("canViewPath business_mode gating", () => {
  it("shows inventory routes in trading mode and hides them in service mode", () => {
    expect(canViewPath({ business_mode: "trading" }, "/accounting/inventory/receipts")).toBe(true);
    expect(canViewPath({ business_mode: "trading" }, "/settings/inventory-units")).toBe(true);
    expect(canViewPath({ business_mode: "trading" }, "/client-contracts")).toBe(false);
    expect(canViewPath({ business_mode: "trading" }, "/settlements/petty-cash")).toBe(false);

    expect(canViewPath({ business_mode: "service" }, "/accounting/inventory/receipts")).toBe(false);
    expect(canViewPath({ business_mode: "service" }, "/settings/inventory-units")).toBe(false);
    expect(canViewPath({ business_mode: "service" }, "/client-contracts")).toBe(true);
    expect(canViewPath({ business_mode: "service" }, "/settlements/petty-cash")).toBe(true);
    expect(canViewPath({ business_mode: "service" }, "/payroll")).toBe(true);
    expect(canViewPath({ business_mode: "service" }, "/receivables")).toBe(true);
  });

  it("excludes inventory from visibleAccessModules in service mode", () => {
    expect(visibleAccessModules({ business_mode: "trading" }).some((m) => m.value === "inventory")).toBe(true);
    expect(visibleAccessModules({ business_mode: "service" }).some((m) => m.value === "inventory")).toBe(false);
  });
});
