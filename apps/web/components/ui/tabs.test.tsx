import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";

describe("Tabs & Segmented Controller Component", () => {
  it("renders segmented tabs with default RTL direction", () => {
    const { container } = render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">روزانه</TabsTrigger>
          <TabsTrigger value="tab2">ماهانه</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">محتوای روزانه</TabsContent>
        <TabsContent value="tab2">محتوای ماهانه</TabsContent>
      </Tabs>,
    );

    const tabsRoot = container.firstChild as HTMLElement;
    expect(tabsRoot.getAttribute("dir")).toBe("rtl");
    expect(screen.getByText("روزانه")).toBeDefined();
    expect(screen.getByText("ماهانه")).toBeDefined();
    expect(screen.getByText("محتوای روزانه")).toBeDefined();
  });

  it("applies line variant styling", () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">نمای کلی</TabsTrigger>
          <TabsTrigger value="discrepancies">مغایرت‌ها</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const trigger = screen.getByText("نمای کلی").closest("button");
    expect(trigger?.className).toContain("border-b-2");
    expect(trigger?.className).toContain("data-[state=active]:border-[var(--ds-primary)]");
  });

  it("applies pills variant styling", () => {
    render(
      <Tabs defaultValue="all">
        <TabsList variant="pills">
          <TabsTrigger value="all">همه</TabsTrigger>
          <TabsTrigger value="filter1">بانک ملت</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const trigger = screen.getByText("همه").closest("button");
    expect(trigger?.className).toContain("rounded-full");
  });

  it("supports sizes xs, sm, default, and lg", () => {
    const { rerender } = render(
      <Tabs defaultValue="t1">
        <TabsList size="xs">
          <TabsTrigger value="t1">سایز خیلی کوچک</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByText("سایز خیلی کوچک").closest("button")?.className).toContain("text-[11px]");

    rerender(
      <Tabs defaultValue="t1">
        <TabsList size="lg">
          <TabsTrigger value="t1">سایز بزرگ</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByText("سایز بزرگ").closest("button")?.className).toContain("text-base");
  });

  it("supports accent variant for AI intelligence triggers", () => {
    render(
      <Tabs defaultValue="ai">
        <TabsList variant="line">
          <TabsTrigger value="ai" variant="accent">
            پیشنهاد دیدبان AI
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const aiTrigger = screen.getByText("پیشنهاد دیدبان AI").closest("button");
    expect(aiTrigger?.className).toContain("data-[state=active]:border-[var(--ds-accent)]");
    expect(aiTrigger?.className).toContain("data-[state=active]:text-[var(--ds-accent)]");
  });
});
