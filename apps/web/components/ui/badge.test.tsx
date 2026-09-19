import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Badge } from "./badge";
import { StatusChip } from "./financial/status-chip";
import { RiskBadge } from "./financial/risk-badge";
import { EvidenceSourceTag } from "./financial/evidence-source-tag";

describe("Badge, Status & Indicator Components", () => {
  describe("Badge Component", () => {
    it("renders default badge text", () => {
      render(<Badge>شاخص فعال</Badge>);
      expect(screen.getByText("شاخص فعال")).toBeDefined();
    });

    it("supports all size variants including compact xs", () => {
      const { container } = render(<Badge size="xs">متراکم</Badge>);
      expect(container.firstChild).toBeDefined();
      expect((container.firstChild as HTMLElement).className).toContain("min-h-5");
    });

    it("renders dot with pulse animation when enabled", () => {
      const { container } = render(<Badge dot pulse>در حال پردازش</Badge>);
      const dot = container.querySelector(".animate-pulse");
      expect(dot).toBeDefined();
    });

    it("invokes onRemove callback when remove button is clicked", () => {
      const onRemove = vi.fn();
      render(<Badge onRemove={onRemove}>فیلتر حساب</Badge>);
      const removeBtn = screen.getByRole("button", { name: "حذف" });
      fireEvent.click(removeBtn);
      expect(onRemove).toHaveBeenCalledTimes(1);
    });
  });

  describe("StatusChip Component", () => {
    it("renders exact match status correctly", () => {
      render(<StatusChip status="exact_match" />);
      expect(screen.getByText("تطبیق قطعی ۱۰۰٪")).toBeDefined();
    });

    it("renders processing status with pulse dot", () => {
      const { container } = render(<StatusChip status="processing" />);
      expect(screen.getByText("در حال پردازش")).toBeDefined();
      expect(container.querySelector(".animate-pulse")).toBeDefined();
    });

    it("supports xs size for financial tables", () => {
      const { container } = render(<StatusChip status="confirmed" size="xs" />);
      expect((container.firstChild as HTMLElement).className).toContain("text-[10.5px]");
    });
  });

  describe("RiskBadge Component", () => {
    it("renders critical level with Persian digits score", () => {
      render(<RiskBadge level="critical" score={92} />);
      expect(screen.getByText("ریسک بحرانی")).toBeDefined();
      expect(screen.getByText("۹۲")).toBeDefined();
    });

    it("renders xs size for dense rows", () => {
      const { container } = render(<RiskBadge level="high" size="xs" />);
      expect((container.firstChild as HTMLElement).className).toContain("text-[10.5px]");
    });
  });

  describe("EvidenceSourceTag Component", () => {
    it("renders tax portal source with detail", () => {
      render(<EvidenceSourceTag source="tax" detail="فاکتور ۱۸۰۲۴" />);
      expect(screen.getByText("سامانه مودیان")).toBeDefined();
      expect(screen.getByText("فاکتور ۱۸۰۲۴")).toBeDefined();
    });
  });
});
