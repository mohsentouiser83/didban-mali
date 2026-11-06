import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { DrawerAction } from "./drawer-action";
import { Input } from "./input";

it("keeps entry fields out of the list until requested and returns focus on Escape", async () => {
  render(<DrawerAction title="حساب جدید"><Input aria-label="نام حساب" /></DrawerAction>);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "حساب جدید" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog", { name: "حساب جدید" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "نام حساب" })).toBeVisible();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});

it("keeps the form open while a save is pending", () => {
  render(<DrawerAction title="حساب جدید" busy><Input aria-label="نام حساب" /></DrawerAction>);
  fireEvent.click(screen.getByRole("button", { name: "حساب جدید" }));
  fireEvent.click(screen.getByRole("button", { name: "بستن" }));
  expect(screen.getByRole("dialog")).toBeVisible();
});
