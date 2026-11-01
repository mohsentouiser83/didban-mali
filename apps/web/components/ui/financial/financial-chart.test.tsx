import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ChartTooltipContent } from "./financial-chart";
it("shows exact source money in the selected chart unit rather than the approximate plotted value", () => {
  const { rerender } = render(
    <ChartTooltipContent
      active
      label="2026-09-30"
      unit="TOMAN"
      payload={[
        {
          graphicalItemId: "balance",
          value: 1234567890123456800,
          payload: { balance: "12345678901234567890.123456" },
        },
      ]}
    />,
  );
  expect(
    screen.getByText("۱٬۲۳۴٬۵۶۷٬۸۹۰٬۱۲۳٬۴۵۶٬۷۸۹٫۰۱۲۳۴۵۶ تومان"),
  ).toBeInTheDocument();
  rerender(
    <ChartTooltipContent
      active
      label="2026-09-30"
      unit="IRR"
      payload={[
        {
          graphicalItemId: "balance",
          value: 12345678901234568000,
          payload: { balance: "12345678901234567890.123456" },
        },
      ]}
    />,
  );
  expect(
    screen.getByText("۱۲٬۳۴۵٬۶۷۸٬۹۰۱٬۲۳۴٬۵۶۷٬۸۹۰٫۱۲۳۴۵۶ ریال"),
  ).toBeInTheDocument();
});
it("keeps real zero and missing source balances distinct in both chart units", () => {
  const { rerender } = render(
    <ChartTooltipContent
      active
      label="2026-09-30"
      unit="TOMAN"
      payload={[
        { graphicalItemId: "balance", value: 0, payload: { balance: "0" } },
      ]}
    />,
  );
  expect(screen.getByText("۰ تومان")).toBeInTheDocument();
  rerender(
    <ChartTooltipContent
      active
      label="2026-09-30"
      unit="IRR"
      payload={[
        { graphicalItemId: "balance", value: 0, payload: { balance: null } },
      ]}
    />,
  );
  expect(screen.getByText("— ریال")).toBeInTheDocument();
});
