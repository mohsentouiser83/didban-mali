import { describe, expect, it } from "vitest";
import {
  isTreasuryAccount,
  isTreasuryRoleKey,
  treasuryRoleLabel,
} from "./account-catalogue";

describe("treasury accounts classification and filtering", () => {
  it("identifies accounts by explicit treasury role", () => {
    expect(isTreasuryAccount({ role: "bank", name: "تجارت" })).toBe(true);
    expect(isTreasuryAccount({ role: "cash", name: "دفتر" })).toBe(true);
    expect(isTreasuryAccount({ role: "petty_cash", name: "تنخواه ۱" })).toBe(true);
    expect(isTreasuryAccount({ role: "cash_bank", name: "کل نقد" })).toBe(true);
  });

  it("identifies accounts by keyword in name if role is unset", () => {
    expect(isTreasuryAccount({ name: "بانک ملی شعبه مرکزی" })).toBe(true);
    expect(isTreasuryAccount({ name: "صندوق فروشگاه" })).toBe(true);
    expect(isTreasuryAccount({ name: "تنخواه‌گردان آقای احمدی" })).toBe(true);
  });

  it("rejects non-treasury accounts", () => {
    expect(
      isTreasuryAccount({ role: "trade_receivable", name: "حساب‌های دریافتنی تجاری" }),
    ).toBe(false);
    expect(
      isTreasuryAccount({ role: "trade_payable", name: "بستانکاران تجاری" }),
    ).toBe(false);
    expect(
      isTreasuryAccount({ role: "revenue", name: "درآمد فروش کالا" }),
    ).toBe(false);
    expect(
      isTreasuryAccount({ name: "هزینه اجاره ساختمان" }),
    ).toBe(false);
  });

  it("returns human-readable Persian labels for treasury roles", () => {
    expect(treasuryRoleLabel("bank")).toBe("بانک");
    expect(treasuryRoleLabel("cash")).toBe("صندوق");
    expect(treasuryRoleLabel("petty_cash")).toBe("تنخواه");
    expect(treasuryRoleLabel("cash_bank")).toBe("نقد و بانک");
    expect(treasuryRoleLabel("trade_receivable")).toBe("");
  });

  it("correctly identifies treasury role keys for document operations", () => {
    expect(isTreasuryRoleKey("bank_a")).toBe(true);
    expect(isTreasuryRoleKey("bank_b")).toBe(true);
    expect(isTreasuryRoleKey("cash_bank")).toBe(true);
    expect(isTreasuryRoleKey("bank")).toBe(true);
    expect(isTreasuryRoleKey("cash")).toBe(true);
    expect(isTreasuryRoleKey("petty_cash")).toBe(true);

    expect(isTreasuryRoleKey("trade_receivable")).toBe(false);
    expect(isTreasuryRoleKey("trade_payable")).toBe(false);
    expect(isTreasuryRoleKey("service_revenue")).toBe(false);
    expect(isTreasuryRoleKey("notes_receivable")).toBe(false);
  });
});
