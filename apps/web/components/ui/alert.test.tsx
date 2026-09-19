import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Alert, AlertTitle, AlertDescription } from "./alert";

describe("Alert Component", () => {
  it("renders default info alert with title and description", () => {
    render(
      <Alert>
        <AlertTitle>اطلاعیه همگام‌سازی</AlertTitle>
        <AlertDescription>درگاه بانکی متصل است.</AlertDescription>
      </Alert>,
    );

    expect(screen.getByText("اطلاعیه همگام‌سازی")).toBeDefined();
    expect(screen.getByText("درگاه بانکی متصل است.")).toBeDefined();
  });

  it("applies danger variant styling", () => {
    const { container } = render(
      <Alert variant="danger">
        <AlertTitle>مغایرت بحرانی</AlertTitle>
      </Alert>,
    );

    const alert = container.firstChild as HTMLElement;
    expect(alert.className).toContain("var(--ds-danger-subtle)");
  });

  it("applies success variant styling", () => {
    const { container } = render(
      <Alert variant="success">
        <AlertTitle>تطبیق موفق</AlertTitle>
      </Alert>,
    );

    const alert = container.firstChild as HTMLElement;
    expect(alert.className).toContain("var(--ds-success-subtle)");
  });

  it("applies warning variant styling", () => {
    const { container } = render(
      <Alert variant="warning">
        <AlertTitle>سررسید چک</AlertTitle>
      </Alert>,
    );

    const alert = container.firstChild as HTMLElement;
    expect(alert.className).toContain("var(--ds-warning-subtle)");
  });

  it("applies AI intelligence variant styling with accent glow", () => {
    const { container } = render(
      <Alert variant="ai">
        <AlertTitle>دیدبان AI</AlertTitle>
      </Alert>,
    );

    const alert = container.firstChild as HTMLElement;
    expect(alert.className).toContain("var(--ds-accent)");
  });
});
