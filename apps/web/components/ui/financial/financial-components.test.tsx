import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { MoneyDisplay, formatFinancialNumber, toPersianDigits } from "./money-display";
import { RiskBadge } from "./risk-badge";
import { StatusChip } from "./status-chip";
import { EvidenceSourceTag } from "./evidence-source-tag";

describe("Financial Base Components", () => {
  describe("MoneyDisplay & Number Formatting", () => {
    it("formats Persian digits and 3-digit comma separators correctly", () => {
      expect(toPersianDigits(1234567890)).toBe("۱۲۳۴۵۶۷۸۹۰");
      expect(formatFinancialNumber(1250000)).toBe("۱٬۲۵۰٬۰۰۰");
      expect(formatFinancialNumber(-850000000)).toBe("۸۵۰٬۰۰۰٬۰۰۰−");
    });

    it("renders MoneyDisplay with correct currency and sign", () => {
      const { container } = render(<MoneyDisplay amount={15000000} currency="ریال" showSign direction="positive" />);
      expect(container.textContent).toContain("ریال");
      expect(container.textContent).toContain("+۱۵٬۰۰۰٬۰۰۰");
    });

    it("renders fallback dash when amount is null", () => {
      const { container } = render(<MoneyDisplay amount={null} />);
      expect(container.textContent).toContain("—");
    });
  });

  describe("RiskBadge", () => {
    it("renders critical risk badge with score", () => {
      render(<RiskBadge level="critical" score={92} />);
      expect(screen.getByText("ریسک بحرانی")).toBeDefined();
      expect(screen.getByText("۹۲")).toBeDefined();
    });

    it("renders custom label when provided", () => {
      render(<RiskBadge level="high" label="اولویت فوری" />);
      expect(screen.getByText("اولویت فوری")).toBeDefined();
    });
  });

  describe("StatusChip", () => {
    it("renders exact match status correctly", () => {
      render(<StatusChip status="exact_match" />);
      expect(screen.getByText("تطبیق قطعی ۱۰۰٪")).toBeDefined();
    });

    it("renders amount mismatch status correctly", () => {
      render(<StatusChip status="amount_mismatch" />);
      expect(screen.getByText("مغایرت مبلغ")).toBeDefined();
    });
  });

  describe("EvidenceSourceTag", () => {
    it("renders accounting source tag with detail", () => {
      render(<EvidenceSourceTag source="accounting" detail="سند ۷۰۴" />);
      expect(screen.getByText("دفتر حسابداری")).toBeDefined();
      expect(screen.getByText("سند ۷۰۴")).toBeDefined();
    });
  });
});
