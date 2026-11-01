import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { Hint } from "./tooltip";

function InvoiceDetails() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>بازکردن فاکتور</Button>
      <Dialog open={open} onOpenChange={setOpen} title="جزئیات فاکتور">
        <Hint label="شرح کامل فاکتور">
          شرح کامل و قابل بررسی فاکتور
        </Hint>
      </Dialog>
    </>
  );
}

it("dismisses nested details before the parent dialog and restores focus at each level", async () => {
  render(<InvoiceDetails />);
  const opener = screen.getByRole("button", { name: "بازکردن فاکتور" });
  opener.focus();
  fireEvent.click(opener);
  await screen.findByRole("dialog", { name: "جزئیات فاکتور" });

  const hint = screen.getByRole("button", { name: "شرح کامل فاکتور" });
  hint.focus();
  fireEvent.click(hint);
  expect(await screen.findByText("شرح کامل و قابل بررسی فاکتور")).toBeVisible();

  fireEvent.keyDown(document.activeElement || document, { key: "Escape" });
  await waitFor(() => {
    expect(screen.queryByText("شرح کامل و قابل بررسی فاکتور")).not.toBeInTheDocument();
    expect(hint).toHaveFocus();
  });
  expect(screen.getByRole("dialog", { name: "جزئیات فاکتور" })).toBeVisible();

  fireEvent.keyDown(hint, { key: "Escape" });
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "جزئیات فاکتور" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
