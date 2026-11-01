import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Drawer } from "./drawer";
import { Button } from "./button";

function Example({ modal = true }: { modal?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button onClick={() => setOpen(true)}>جزئیات</Button>
    <Drawer title="جزئیات فاکتور" open={open} onOpenChange={setOpen} modal={modal}>
      <p>شماره فاکتور</p>
    </Drawer>
  </>;
}

describe("Drawer", () => {
  it("opens named details and restores focus after closing", async () => {
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "جزئیات" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "جزئیات فاکتور" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "بستن" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
  it("closes on a pointer click outside the non-modal panel", async () => {
    // Radix uses PointerEvent fields that jsdom does not provide by default.
    vi.stubGlobal("PointerEvent", MouseEvent);
    try {
      render(<Example modal={false} />);
      fireEvent.click(screen.getByRole("button", { name: "جزئیات" }));
      expect(screen.getByRole("dialog")).toBeVisible();
      // Radix defers its document listener until after the opening event.
      await new Promise((resolve) => setTimeout(resolve, 0));
      fireEvent.pointerDown(document.body, { button: 0, pointerType: "mouse" });
      fireEvent.click(document.body);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("keeps the workspace accessible in non-modal mode and closes with Escape", async () => {
    render(<Example modal={false} />);
    fireEvent.click(screen.getByRole("button", { name: "جزئیات" }));
    expect(screen.getByRole("button", { name: "جزئیات" })).toBeVisible();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
