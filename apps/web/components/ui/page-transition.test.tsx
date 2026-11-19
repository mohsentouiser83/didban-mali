import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageTransition } from "./page-transition";

const state = vi.hoisted(() => ({ pathname: "/initial" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));

describe("PageTransition", () => {
  it("renders children with motion-safe:animate-page-reveal and min-w-0", () => {
    render(
      <PageTransition>
        <p>محتوای آزمایشی</p>
      </PageTransition>,
    );

    const content = screen.getByText("محتوای آزمایشی");
    expect(content).toBeInTheDocument();
    const container = content.parentElement;
    expect(container).toHaveClass("motion-safe:animate-page-reveal");
    expect(container).toHaveClass("min-w-0");
  });

  it("updates key and preserves animation classes on route change", () => {
    const { rerender } = render(
      <PageTransition>
        <p>محتوای اول</p>
      </PageTransition>,
    );

    expect(screen.getByText("محتوای اول")).toBeInTheDocument();

    state.pathname = "/reports";
    rerender(
      <PageTransition>
        <p>محتوای دوم</p>
      </PageTransition>,
    );

    const secondContent = screen.getByText("محتوای دوم");
    expect(secondContent).toBeInTheDocument();
    expect(secondContent.parentElement).toHaveClass("motion-safe:animate-page-reveal");
  });
});
