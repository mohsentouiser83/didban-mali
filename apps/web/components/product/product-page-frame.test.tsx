import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { ProductPageFrame } from "./product-page-frame";
const route = vi.hoisted(() => ({ path: "/cashflow" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.path }));
const cancel = vi.fn();
const animate = vi.fn(
  (_frames: Keyframe[], _options?: KeyframeAnimationOptions) => ({ cancel }),
);
const originalAnimate = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "animate",
);
beforeEach(() => {
  route.path = "/cashflow";
  vi.clearAllMocks();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: animate,
  });
});
afterEach(() => {
  if (originalAnimate)
    Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate);
  else Reflect.deleteProperty(HTMLElement.prototype, "animate");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Content() {
  const [value, setValue] = useState("");
  return (
    <input
      aria-label="یادداشت"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
it("animates route changes without replaying on data updates or resetting content", () => {
  const view = (
    <ProductPageFrame>
      <Content />
    </ProductPageFrame>
  );
  const { rerender } = render(view);
  expect(animate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("یادداشت"), {
    target: { value: "پیگیری" },
  });
  route.path = "/payables";
  rerender(
    <ProductPageFrame>
      <Content />
    </ProductPageFrame>,
  );
  expect(animate).toHaveBeenCalledTimes(1);
  expect(animate.mock.calls[0]?.[0]).toEqual([
    { transform: "scale(.975)", transformOrigin: "top right" },
    { transform: "scale(1)", transformOrigin: "top right" },
  ]);
  expect(screen.getByLabelText("یادداشت")).toHaveValue("پیگیری");
  rerender(
    <ProductPageFrame notice="داده تازه">
      <Content />
    </ProductPageFrame>,
  );
  expect(animate).toHaveBeenCalledTimes(1);
  route.path = "/receivables";
  rerender(
    <ProductPageFrame>
      <Content />
    </ProductPageFrame>,
  );
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(animate).toHaveBeenCalledTimes(2);
});
it("skips movement when reduced motion is enabled", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  const { rerender } = render(<ProductPageFrame>داده</ProductPageFrame>);
  route.path = "/payables";
  rerender(<ProductPageFrame>صفحه جدید</ProductPageFrame>);
  expect(animate).not.toHaveBeenCalled();
  expect(screen.getByText("صفحه جدید")).toBeInTheDocument();
});

it("starts immediately even while route data is loading", () => {
  const { rerender } = render(<ProductPageFrame>صفحه قبلی</ProductPageFrame>);
  route.path = "/payables";
  rerender(
    <ProductPageFrame>
      <div data-slot="skeleton">بارگذاری</div>
    </ProductPageFrame>,
  );
  expect(animate).toHaveBeenCalledTimes(1);
  expect(animate.mock.calls[0]?.[1]).toMatchObject({ duration: 200, delay: 0 });
  rerender(<ProductPageFrame>داده واقعی</ProductPageFrame>);
  expect(animate).toHaveBeenCalledTimes(1);
  rerender(<ProductPageFrame>داده تازه</ProductPageFrame>);
  expect(animate).toHaveBeenCalledTimes(1);
});
