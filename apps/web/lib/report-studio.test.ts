import { describe, expect, it } from "vitest";
import {
  createDefaultStudioSpec,
  ENTITY_OPTIONS,
  LAYOUT_OPTIONS,
  WIDGET_TYPE_OPTIONS,
} from "./report-studio";

describe("Report Studio helpers and default spec", () => {
  it("creates a valid default layout spec with sections and widgets", () => {
    const spec = createDefaultStudioSpec("p-test", "IRR");
    expect(spec.title).toBe("گزارش جدید");
    expect(spec.global_filters.period_id).toBe("p-test");
    expect(spec.global_filters.unit).toBe("IRR");
    expect(spec.sections.length).toBeGreaterThanOrEqual(2);

    const kpiSection = spec.sections[0];
    expect(kpiSection.layout).toBe("grid-4");
    expect(kpiSection.widgets.length).toBe(4);
    expect(kpiSection.widgets[0].type).toBe("kpi_card");

    const chartSection = spec.sections[1];
    expect(chartSection.layout).toBe("grid-2");
    expect(chartSection.widgets.length).toBe(2);
  });

  it("contains all expected entity options and widget types", () => {
    expect(ENTITY_OPTIONS.some((e) => e.value === "invoices")).toBe(true);
    expect(ENTITY_OPTIONS.some((e) => e.value === "ledger")).toBe(true);
    expect(ENTITY_OPTIONS.some((e) => e.value === "cheques")).toBe(true);
    expect(ENTITY_OPTIONS.some((e) => e.value === "payroll")).toBe(true);
    expect(ENTITY_OPTIONS.some((e) => e.value === "inventory")).toBe(true);

    expect(WIDGET_TYPE_OPTIONS.some((w) => w.value === "kpi_card")).toBe(true);
    expect(WIDGET_TYPE_OPTIONS.some((w) => w.value === "line_chart")).toBe(true);
    expect(WIDGET_TYPE_OPTIONS.some((w) => w.value === "bar_chart")).toBe(true);
    expect(WIDGET_TYPE_OPTIONS.some((w) => w.value === "donut_chart")).toBe(true);
    expect(WIDGET_TYPE_OPTIONS.some((w) => w.value === "data_table")).toBe(true);
    expect(WIDGET_TYPE_OPTIONS.some((w) => w.value === "ai_summary")).toBe(true);

    expect(LAYOUT_OPTIONS.some((l) => l.value === "grid-1")).toBe(true);
    expect(LAYOUT_OPTIONS.some((l) => l.value === "grid-2")).toBe(true);
    expect(LAYOUT_OPTIONS.some((l) => l.value === "split-2-1")).toBe(true);
  });
});
