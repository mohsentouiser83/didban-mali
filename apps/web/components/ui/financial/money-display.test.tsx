import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MoneyDisplay } from "./money-display";

it("removes insignificant decimal zeros without rounding large financial strings", () => {
  const { rerender } = render(<MoneyDisplay amount="0.000000000000000000" currency="" />);
  expect(screen.getByText("۰")).toBeInTheDocument();
  rerender(<MoneyDisplay amount="9007199254740993.12000" currency="" />);
  expect(screen.getByText("۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳٫۱۲")).toBeInTheDocument();
});

it("allows wrapping between thousands groups without changing the exact amount", () => {
  const { container } = render(<MoneyDisplay amount="9007199254740993123" currency="" wrap />);
  expect(container.textContent).toBe("۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳٬۱۲۳");
  expect(container.querySelectorAll("wbr")).toHaveLength(6);
});
