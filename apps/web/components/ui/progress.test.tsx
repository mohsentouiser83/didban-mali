import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Progress } from "./progress";

describe("Progress Component", () => {
  it("renders with default props and progressbar role", () => {
    render(<Progress value={45} aria-label="پیشرفت تطبیق" />);
    const progressbar = screen.getByRole("progressbar", { name: "پیشرفت تطبیق" });
    expect(progressbar).toBeDefined();
    expect(progressbar.getAttribute("aria-valuenow")).toBe("45");
  });

  it("clamps values exceeding 100 to 100 and negative values to 0", () => {
    const { rerender } = render(<Progress value={140} aria-label="بیشینه" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");

    rerender(<Progress value={-20} aria-label="کمینه" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  });

  it("applies size variants xs, sm, and lg", () => {
    const { container, rerender } = render(<Progress size="xs" value={30} />);
    expect(container.firstChild).toHaveProperty("className");
    expect((container.firstChild as HTMLElement).className).toContain("h-1");

    rerender(<Progress size="lg" value={30} />);
    expect((container.firstChild as HTMLElement).className).toContain("h-4");
  });

  it("applies semantic variant success and striped animation", () => {
    const { container } = render(<Progress variant="success" striped value={80} />);
    const indicator = (container.firstChild as HTMLElement).firstChild as HTMLElement;
    expect(indicator.className).toContain("var(--ds-success)");
    expect(indicator.className).toContain("animate-[progress-stripes");
  });
});
