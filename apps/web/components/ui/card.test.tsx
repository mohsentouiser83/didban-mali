import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./card";

describe("Card Component & Surfaces", () => {
  it("renders default card with header and content", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>خلاصه نقدینگی</CardTitle>
          <CardDescription>بررسی جریان وجوه نقد</CardDescription>
        </CardHeader>
        <CardContent>موجودی کل</CardContent>
        <CardFooter>پاورقی</CardFooter>
      </Card>,
    );
    expect(screen.getByText("خلاصه نقدینگی")).toBeDefined();
    expect(screen.getByText("بررسی جریان وجوه نقد")).toBeDefined();
    expect(screen.getByText("موجودی کل")).toBeDefined();
    expect(screen.getByText("پاورقی")).toBeDefined();
  });

  it("applies elevated variant classes", () => {
    const { container } = render(<Card variant="elevated">کارت شاخص</Card>);
    expect((container.firstChild as HTMLElement).className).toContain("shadow-[var(--ds-shadow-md)]");
  });

  it("applies interactive variant with hover elevation", () => {
    const { container } = render(<Card variant="interactive">کارت کلیک‌پذیر</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("cursor-pointer");
    expect(card.className).toContain("hover:-translate-y-0.5");
  });

  it("applies AI intelligence variant with accent glow", () => {
    const { container } = render(<Card variant="ai">بینش هوش مصنوعی</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("var(--ds-accent)");
  });

  it("applies danger variant for critical financial risk alerts", () => {
    const { container } = render(<Card variant="danger">هشدار کسری تنخواه</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("var(--ds-danger)");
  });
});
