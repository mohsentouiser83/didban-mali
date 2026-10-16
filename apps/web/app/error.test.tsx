import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ErrorBoundary from "./error";

it("retries the failed segment without exposing its internal exception", () => {
  const retry = vi.fn();
  render(<ErrorBoundary error={Object.assign(Error("private internal trace"), { digest: "trace-123" })} retry={retry} />);
  expect(screen.queryByText("private internal trace")).toBeNull();
  expect(screen.getByText("کد پیگیری: trace-123")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  expect(retry).toHaveBeenCalledOnce();
});
