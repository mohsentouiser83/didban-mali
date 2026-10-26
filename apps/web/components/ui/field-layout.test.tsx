import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { DetailField, ControlLabel } from "./field-layout";
import { Calendar, Wallet } from "./icons";

it("preserves zero separately from unavailable values and labels decorative icons", () => {
  const { container } = render(<dl><DetailField icon={Wallet} label="مانده صفر">{0}</DetailField><DetailField icon={Calendar} label="سررسید">{null}</DetailField></dl>);
  const values = screen.getAllByRole("definition");
  expect(within(values[0]).getByText("0")).toBeVisible();
  expect(within(values[1]).getByText("—")).toBeVisible();
  expect([...container.querySelectorAll('svg')].every(icon => icon.getAttribute("aria-hidden") === "true")).toBe(true);
});

it("preserves interactive field values and form label associations", () => {
  render(<><dl><DetailField icon={Wallet} label="سند"><a href="/sample">مشاهده سند</a></DetailField></dl><ControlLabel htmlFor="sample-date" icon={Calendar}>تاریخ روز</ControlLabel><input id="sample-date" /></>);
  expect(screen.getByRole("link", { name: "مشاهده سند" })).toHaveAttribute("href", "/sample");
  expect(screen.getByLabelText("تاریخ روز")).toHaveAttribute("id", "sample-date");
});
