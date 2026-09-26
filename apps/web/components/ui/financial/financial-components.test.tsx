import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { MoneyDisplay, formatFinancialNumber, toPersianDigits } from "./money-display";
import { RiskBadge } from "./risk-badge";
import { StatusChip } from "./status-chip";
import { StatusBadge } from "./status-badge";
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

    it("renders fallback dash when amount is null or undefined", () => {
      const { container: c1 } = render(<MoneyDisplay amount={null} />);
      expect(c1.textContent).toContain("—");

      const { container: c2 } = render(<MoneyDisplay amount={undefined} />);
      expect(c2.textContent).toContain("—");
    });

    it("formats executive compact mode in Toman (میلیارد تومان / میلیون تومان)", () => {
      // 124,000,000,000 Rials = 12.4 billion Toman
      const { container: cBillion } = render(
        <MoneyDisplay amount={124_000_000_000} currency="ریال" executive />
      );
      expect(cBillion.textContent).toContain("میلیارد تومان");
      expect(cBillion.textContent).toContain("۱۲٫۴");
      expect(cBillion.firstElementChild?.getAttribute("title")).toContain("ریال");

      // 485,000,000 Rials = 48.5 million Toman
      const { container: cMillion } = render(
        <MoneyDisplay amount={485_000_000} currency="ریال" executive />
      );
      expect(cMillion.textContent).toContain("میلیون تومان");
      expect(cMillion.textContent).toContain("۴۸٫۵");
    });
  });

  describe("StatusBadge", () => {
    it("renders finding lifecycle badges correctly", () => {
      const { unmount: u1 } = render(<StatusBadge status="needs_review" />);
      expect(screen.getByText("نیازمند بررسی")).toBeDefined();
      u1();

      const { unmount: u2 } = render(<StatusBadge status="confirmed" />);
      expect(screen.getByText("تاییدشده")).toBeDefined();
      u2();

      const { unmount: u3 } = render(<StatusBadge status="resolved" />);
      expect(screen.getByText("رفع‌شده")).toBeDefined();
      u3();
    });

    it("renders reconciliation matching badges correctly", () => {
      const { unmount: u1 } = render(<StatusBadge status="auto_matched" />);
      expect(screen.getByText("تطبیق قطعی")).toBeDefined();
      u1();

      const { unmount: u2 } = render(<StatusBadge status="amount_mismatch" />);
      expect(screen.getByText("مغایرت مبلغ")).toBeDefined();
      u2();
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

