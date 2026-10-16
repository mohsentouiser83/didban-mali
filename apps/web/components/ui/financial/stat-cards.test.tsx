import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WalletCards } from "@/components/ui/icons";
import { StatCards } from "./stat-cards";
import { KpiMetricCard } from "./kpi-metric-card";

describe("shared statistical cards", () => {
  it("keeps zero, unknown values, and large precise amounts distinct", () => {
    render(<StatCards items={[
      { title: "صفر", value: "0", icon: WalletCards },
      { title: "نامشخص", value: null, empty: "تاریخ وصول ثبت نشده", icon: WalletCards },
      { title: "مانده بزرگ", value: "9007199254740993123", icon: WalletCards },
    ]} />);
    expect(screen.getByLabelText("صفر").textContent).toContain("۰");
    expect(screen.getByLabelText("نامشخص").textContent).toContain("تاریخ وصول ثبت نشده");
    expect(screen.getByLabelText("مانده بزرگ").textContent?.replace(/[٬,\s]/g, "")).toContain("۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳۱۲۳");
  });

  it("keeps the card mounted through loading and updates its value", () => {
    const items = [{ title: "مانده", value: "10", icon: WalletCards }];
    const { rerender } = render(<StatCards items={items} loading />);
    const card = screen.getByLabelText("مانده");
    expect(card.getAttribute("aria-busy")).toBe("true");
    rerender(<StatCards items={items} />);
    expect(screen.getByLabelText("مانده")).toBe(card);
    expect(card.getAttribute("aria-busy")).toBe("false");
    expect(card.textContent).toContain("۱۰");
  });

  it("does not replace a limited zero metric with an unavailable message", () => {
    render(<KpiMetricCard title="مانده محدود" value={0} status="limited" limitedReason="تاریخ ناقص" />);
    expect(screen.queryByText("غیرقابل‌محاسبه")).toBeNull();
    expect(screen.getByText("۰")).toBeDefined();
  });
});
