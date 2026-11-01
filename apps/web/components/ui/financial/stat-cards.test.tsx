import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Metric } from "@/lib/api";
import { StatCard } from "./stat-cards";

const workspace = vi.hoisted(() => ({ unit: "TOMAN" as "IRR" | "TOMAN" }));
vi.mock("@/hooks/workspace", () => ({ useWorkspace: () => workspace }));

const metric: Metric = {
  metric_key: "revenue",
  basis: "ledger",
  value: "0",
  status: "available",
  unit: "IRR",
  reason_codes: [],
  comparison: { previous: "0", delta: "0", percent: "0" },
};

describe("financial metric availability", () => {
  it("displays a zero-percent comparison instead of a missing-comparison message", () => {
    render(<StatCard label="درآمد دفتر" metric={metric} />);
    expect(screen.getByText("۰٪ نسبت به دوره مقایسه")).toBeInTheDocument();
    expect(screen.queryByText("مقایسه دوره قبل موجود نیست")).not.toBeInTheDocument();
  });

  it("preserves zero as an available amount, and replaces it with a specific unavailable state", () => {
    const view = render(<StatCard label="درآمد دفتر" metric={metric} />);
    expect(screen.getByText("۰", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("—", { exact: true })).not.toBeInTheDocument();

    view.rerender(
      <StatCard
        label="درآمد دفتر"
        metric={{
          ...metric,
          value: null,
          status: "unavailable",
          reason: "دفتر حسابداری این دوره موجود نیست.",
        }}
      />,
    );
    expect(screen.getByText("—", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("دفتر حسابداری این دوره موجود نیست.")).toBeInTheDocument();
    expect(screen.queryByText("۰", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("۰٪ نسبت به دوره مقایسه")).not.toBeInTheDocument();
  });

  it("converts the financial amount to toman while leaving the comparison percentage unchanged", () => {
    render(
      <StatCard
        label="درآمد دفتر"
        metric={{
          ...metric,
          value: "10000",
          comparison: { previous: "9000", delta: "1000", percent: "10.5" },
        }}
      />,
    );
    expect(screen.getByText("۱٬۰۰۰", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("۱۰٫۵٪ نسبت به دوره مقایسه")).toBeInTheDocument();
  });
  it("reuses the value element on unrelated renders and reveals a changed display unit", () => {
    workspace.unit = "TOMAN";
    const view = render(<StatCard label="درآمد دفتر" metric={{ ...metric, value: "10000" }} />);
    const value = screen.getByText("۱٬۰۰۰", { exact: true });
    view.rerender(<StatCard label="درآمد دفتر" metric={{ ...metric, value: "10000" }} />);
    expect(screen.getByText("۱٬۰۰۰", { exact: true })).toBe(value);

    workspace.unit = "IRR";
    view.rerender(<StatCard label="درآمد دفتر" metric={{ ...metric, value: "10000" }} />);
    expect(screen.getByText("۱۰٬۰۰۰", { exact: true })).not.toBe(value);
    expect(screen.getByText("ریال")).toBeInTheDocument();
    workspace.unit = "TOMAN";
  });

});
