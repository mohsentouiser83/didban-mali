import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Hint } from "./tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";
import { StatusBadge } from "./financial/status-badge";
import { StatusChip } from "./financial/status-chip";
import { RiskBadge } from "./financial/risk-badge";

afterEach(cleanup);

it("exposes a hint by click and closes it with Escape without a native title", async () => {
  render(<Hint content="نام کامل فایل بانکی"><span>فایل…</span></Hint>);
  const trigger = screen.getByRole("button", { name: "نام کامل فایل بانکی" });
  expect(trigger).not.toHaveAttribute("title");
  fireEvent.click(trigger);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("نام کامل فایل بانکی");
  fireEvent.keyDown(trigger, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

it("opens explanatory text with the keyboard", async () => {
  render(<Hint content="تاریخ وصول ثبت نشده"><span>محدودیت شاخص</span></Hint>);
  fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
  expect(await screen.findByRole("tooltip")).toHaveTextContent("تاریخ وصول ثبت نشده");
});

it("inherits tab appearance and connects the selected tab to its panel", () => {
  render(<Tabs defaultValue="one" variant="segmented" size="lg"><TabsList aria-label="نمایش"><TabsTrigger value="one">اول</TabsTrigger><TabsTrigger value="two">دوم</TabsTrigger></TabsList><TabsContent value="one">پنل اول</TabsContent><TabsContent value="two">پنل دوم</TabsContent></Tabs>);
  expect(screen.getByRole("tablist").className).toContain("h-12");
  expect(screen.getByRole("tab", { name: "اول" }).className).toContain("h-10");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "دوم" }), { button: 0, ctrlKey: false });
  expect(screen.getByRole("tabpanel")).toHaveTextContent("پنل دوم");
  expect(screen.getByRole("tab", { selected: true })).toHaveAttribute("aria-controls", screen.getByRole("tabpanel").id);
});

it("uses the common badge surface and keeps unknown states neutral", () => {
  const { container } = render(<><StatusBadge status="unallocated" /><StatusBadge status="constructor" /><StatusChip status="unrecognized" /><RiskBadge level="unrecognized" /><RiskBadge level="high" score={0} /></>);
  expect(container.querySelectorAll('[data-slot="badge"]')).toHaveLength(5);
  expect(screen.getByText("بدون تخصیص")).toBeInTheDocument();
  expect(screen.getAllByText("نامشخص")).toHaveLength(3);
  expect(screen.getByText("۰")).toBeInTheDocument();
  expect(container.textContent).not.toContain("unrecognized");
});
