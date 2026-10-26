import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { TablePagination } from "./table-pagination";

it("shows the actual row range and navigates across a partial final page", () => {
  const onPageChange = vi.fn();
  const view = render(<TablePagination total={1098} page={0} pageSize={25} onPageChange={onPageChange} />);
  expect(screen.getByRole("status")).toHaveTextContent("۱–۲۵ از ۱٬۰۹۸ ردیف");
  expect(screen.getByRole("button", { name: "صفحه قبل" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "صفحه آخر" }));
  expect(onPageChange).toHaveBeenCalledWith(43);
  view.rerender(<TablePagination total={1098} page={43} pageSize={25} onPageChange={onPageChange} />);
  expect(screen.getByRole("status")).toHaveTextContent("۱٬۰۷۶–۱٬۰۹۸ از ۱٬۰۹۸ ردیف");
  expect(screen.getByRole("button", { name: "صفحه بعد" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "صفحه ۴۴" })).toHaveAttribute("aria-current", "page");
});

it("prevents competing requests while loading and handles an empty result", () => {
  render(<TablePagination total={0} page={0} pageSize={25} loading onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("در حال دریافت ردیف‌ها…");
  expect(screen.getByRole("combobox", { name: "ردیف در صفحه" })).toBeDisabled();
  screen.getAllByRole("button").forEach((button) => expect(button).toBeDisabled());
});
