import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AmountInput } from "./input";
let frames: FrameRequestCallback[] = [];
beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
});
afterEach(() => vi.unstubAllGlobals());
function AmountHarness({
  initial = "",
  onValue = () => {},
}: {
  initial?: string;
  onValue?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <AmountInput
      aria-label="مبلغ"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}
function change(value: string, cursor: number) {
  const input = screen.getByRole("textbox", {
    name: "مبلغ",
  }) as HTMLInputElement;
  fireEvent.change(input, {
    target: { value, selectionStart: cursor, selectionEnd: cursor },
  });
  act(() => frames.splice(0).forEach((callback) => callback(0)));
  return input;
}
it("keeps the insertion caret next to the edited middle digit when grouping moves", () => {
  render(<AmountHarness initial="1234" />);
  const input = change("۱٬۲۹۳۴", 4);
  expect(input).toHaveValue("۱۲٬۹۳۴");
  expect(input.selectionStart).toBe(4);
  expect(input.selectionEnd).toBe(4);
});
it("keeps caret zero after deleting the first digit instead of moving it one character forward", () => {
  render(<AmountHarness initial="1234" />);
  const input = change("٬۲۳۴", 0);
  expect(input).toHaveValue("۲۳۴");
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(0);
});
it("normalizes pasted Persian digits without changing their position or decimal value", () => {
  const onValue = vi.fn();
  render(<AmountHarness onValue={onValue} />);
  const text = "۱۲۳٬۴۵۶٫۷۸۹";
  const input = change(text, text.length);
  expect(onValue).toHaveBeenLastCalledWith("123456.789");
  expect(input).toHaveValue(text);
  expect(input.selectionStart).toBe(text.length);
});
it("preserves large monetary integers and eighteen decimal price digits exactly", () => {
  const onValue = vi.fn();
  render(<AmountHarness onValue={onValue} />);
  const text = "۱۲۳٬۴۵۶٬۷۸۹٬۰۱۲٬۳۴۵٬۶۷۸٫۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۱";
  const input = change(text, text.length);
  expect(onValue).toHaveBeenLastCalledWith(
    "123456789012345678.000000000000000001",
  );
  expect(input).toHaveValue(text);
  expect(input.selectionStart).toBe(text.length);
});
