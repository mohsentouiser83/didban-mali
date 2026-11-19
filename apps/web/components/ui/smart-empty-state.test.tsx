import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SmartEmptyState, type OnboardingStep } from "./smart-empty-state";

const onStep1 = vi.fn();
const onStep2 = vi.fn();
const onStep3 = vi.fn();

const mockSteps: OnboardingStep[] = [
  {
    id: "step-1",
    title: "تعریف انبار اصلی",
    description: "برای نگهداری کالاها، انبار مرکزی خود را ثبت کنید.",
    status: "completed",
    onClick: onStep1,
  },
  {
    id: "step-2",
    title: "ثبت موجودی اولیه",
    description: "تعداد و بهای تمام‌شده کالاهای موجود را وارد نمایید.",
    status: "active",
    ctaText: "ثبت موجودی اولیه",
    onClick: onStep2,
  },
  {
    id: "step-3",
    title: "صدور اولین حواله یا فاکتور",
    description: "اولین گردش خروج کالا را در سیستم ایجاد کنید.",
    status: "pending",
    onClick: onStep3,
  },
];

describe("SmartEmptyState", () => {
  it("renders friendly title, description, and onboarding step cards", () => {
    render(
      <SmartEmptyState
        title="انبار هنوز راه‌اندازی نشده است"
        description="برای شروع فرآیند انبارداری، مراحل زیر را طی کنید:"
        badgeText="شروع سریع انبارداری"
        steps={mockSteps}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "انبار هنوز راه‌اندازی نشده است" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("برای شروع فرآیند انبارداری، مراحل زیر را طی کنید:"),
    ).toBeInTheDocument();
    expect(screen.getByText("شروع سریع انبارداری")).toBeInTheDocument();

    expect(screen.getByText("تعریف انبار اصلی")).toBeInTheDocument();
    expect(screen.getByText("صدور اولین حواله یا فاکتور")).toBeInTheDocument();

    expect(screen.getByText("گام ۱")).toBeInTheDocument();
    expect(screen.getByText("گام ۲")).toBeInTheDocument();
    expect(screen.getByText("گام ۳")).toBeInTheDocument();
  });

  it("renders correct status badges and accessibility attributes", () => {
    render(<SmartEmptyState steps={mockSteps} />);

    expect(screen.getByText("تکمیل شده")).toBeInTheDocument();
    expect(screen.getByText("گام جاری")).toBeInTheDocument();
    expect(screen.getByText("در انتظار")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);

    // Step 2 is active, so aria-current should be 'step'
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[0]).not.toHaveAttribute("aria-current");
    expect(items[2]).not.toHaveAttribute("aria-current");
  });

  it("renders and triggers primary CTA button for the active step", () => {
    onStep2.mockReset();
    render(<SmartEmptyState steps={mockSteps} />);

    // Primary CTA is automatically created for the active step
    const primaryButton = screen.getByTestId("smart-empty-state-primary-cta");
    expect(primaryButton).toBeInTheDocument();
    expect(primaryButton).toHaveTextContent("ثبت موجودی اولیه");

    fireEvent.click(primaryButton);
    expect(onStep2).toHaveBeenCalledTimes(1);
  });

  it("supports clicking individual step cards if onClick is provided", () => {
    onStep1.mockReset();
    render(<SmartEmptyState steps={mockSteps} />);

    const items = screen.getAllByRole("listitem");
    fireEvent.click(items[0]);
    expect(onStep1).toHaveBeenCalledTimes(1);
  });

  it("supports custom primary CTA override", () => {
    const customClick = vi.fn();
    render(
      <SmartEmptyState
        steps={mockSteps}
        primaryCta={{
          text: "شروع خودکار راه‌اندازی",
          onClick: customClick,
        }}
      />,
    );

    const cta = screen.getByTestId("smart-empty-state-primary-cta");
    expect(cta).toHaveTextContent("شروع خودکار راه‌اندازی");
    fireEvent.click(cta);
    expect(customClick).toHaveBeenCalledTimes(1);
  });
});
