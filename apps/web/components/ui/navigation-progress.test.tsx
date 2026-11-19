/* eslint-disable @next/next/no-html-link-for-pages */
import { fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavigationProgress } from "./navigation-progress";

const state = vi.hoisted(() => ({ pathname: "/initial" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));

describe("NavigationProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.pathname = "/initial";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not render when idle", () => {
    render(<NavigationProgress />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("activates progress on internal link click to different pathname and completes on route change", () => {
    const { rerender } = render(
      <div>
        <NavigationProgress />
        <a href="/reports" data-testid="test-link">گزارش‌ها</a>
      </div>,
    );

    const link = screen.getByTestId("test-link");
    fireEvent.click(link);

    const progress = screen.getByRole("progressbar");
    expect(progress).toBeInTheDocument();
    expect(progress).toHaveAttribute("aria-valuenow", "25");

    // Advance trickle timer
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(Number(progress.getAttribute("aria-valuenow"))).toBeGreaterThan(25);

    // Route finishes navigating
    state.pathname = "/reports";
    rerender(
      <div>
        <NavigationProgress />
        <a href="/reports" data-testid="test-link">گزارش‌ها</a>
      </div>,
    );

    act(() => {
      vi.advanceTimersByTime(50);
    });

    // Completes to 100
    expect(progress).toHaveAttribute("aria-valuenow", "100");

    // Fades out and removes after timer
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("ignores clicks on current path or external/anchor links", () => {
    render(
      <div>
        <NavigationProgress />
        <a href="/initial" data-testid="same-link">همان صفحه</a>
        <a href="#hash" data-testid="hash-link">هش</a>
        <a href="https://external.example.com" data-testid="external-link">خارجی</a>
      </div>,
    );

    fireEvent.click(screen.getByTestId("same-link"));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("hash-link"));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("external-link"));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("starts progress on custom navigation event", () => {
    render(<NavigationProgress />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent("didban:navigation-start"));
    });

    const progress = screen.getByRole("progressbar");
    expect(progress).toBeInTheDocument();
    expect(progress).toHaveAttribute("aria-valuenow", "25");
  });
});
