import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FileInput } from "./file-input";

describe("FileInput", () => {
  it("opens the hidden file input through the shared button and forwards selection", () => {
    const onChange = vi.fn();
    const { container } = render(<><label htmlFor="file">فایل سند</label><FileInput id="file" accept=".csv" onChange={onChange} /></>);
    const native = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(native, "click");
    fireEvent.click(screen.getByRole("button", { name: "فایل سند" }));
    expect(click).toHaveBeenCalledOnce();
    expect(native).toHaveClass("hidden");
    expect(native).toHaveAttribute("accept", ".csv");
    fireEvent.change(native, { target: { files: [new File(["test"], "test.csv")] } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("shows the selected filename and disables the picker while busy", () => {
    const { container } = render(<FileInput fileName="bank.csv" disabled />);
    expect(screen.getByRole("button", { name: "bank.csv" })).toBeDisabled();
    expect(container.querySelector('input[type="file"]')).toBeDisabled();
  });
});
