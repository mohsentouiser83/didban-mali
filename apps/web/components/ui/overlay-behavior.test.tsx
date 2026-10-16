import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import { ConfirmDialog } from "./confirm-dialog";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./dialog";
import { Drawer } from "./drawer";

function ControlledOverlay({ drawer }: { drawer: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button onClick={() => setOpen(true)}>باز کردن</Button>
    {drawer ? <Drawer open={open} onOpenChange={setOpen} title="جزئیات"><p>محتوا</p></Drawer> :
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>جزئیات</DialogTitle><DialogDescription>محتوا</DialogDescription></DialogContent></Dialog>}
  </>;
}

function OverlaySequence() {
  const [step, setStep] = useState(0);
  return <>
    <Button onClick={() => setStep(1)}>فرمان‌ها</Button>
    <Dialog open={step === 1} onOpenChange={(open) => { if (!open) setStep(0); }}>
      <DialogContent><DialogTitle>فرمان‌ها</DialogTitle><DialogDescription>انتخاب دستور</DialogDescription>
        <Button onClick={() => setStep(2)}>رفتن به پشتیبانی</Button>
      </DialogContent>
    </Dialog>
    <Dialog open={step === 2} onOpenChange={(open) => { if (!open) setStep(0); }}>
      <DialogContent><DialogTitle>پشتیبانی</DialogTitle><DialogDescription>فرم پشتیبانی</DialogDescription></DialogContent>
    </Dialog>
  </>;
}

describe("shared overlay behavior", () => {
  it("restores the original launcher after replacing an open dialog", async () => {
    render(<OverlaySequence />);
    const launcher = screen.getByRole("button", { name: "فرمان‌ها" });
    launcher.focus();
    fireEvent.click(launcher);
    const next = screen.getByRole("button", { name: "رفتن به پشتیبانی" });
    next.focus();
    fireEvent.click(next);
    expect(screen.getByRole("dialog", { name: "پشتیبانی" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "بستن پنجره" }));
    await waitFor(() => expect(launcher).toHaveFocus());
  });

  it.each([false, true])("uses Button for closing and restores an external opener (drawer=%s)", async (drawer) => {
    render(<ControlledOverlay drawer={drawer} />);
    const opener = screen.getByRole("button", { name: "باز کردن" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "جزئیات" })).toHaveAttribute("data-slot", drawer ? "sheet-content" : "dialog-content");
    const close = screen.getByRole("button", { name: drawer ? "بستن" : "بستن پنجره" });
    expect(close).toHaveAttribute("data-slot", "button");
    expect(close).toHaveAttribute("type", "button");
    fireEvent.click(close);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("disables dismissal and destructive confirmation while the request is busy", () => {
    const change = vi.fn();
    const confirm = vi.fn();
    render(<ConfirmDialog open onOpenChange={change} title="حذف مورد" description="مورد حذف شود؟" busy onConfirm={confirm} />);
    expect(screen.getByRole("button", { name: "بستن پنجره" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "انصراف" })).toBeDisabled();
    const action = screen.getByRole("button", { name: "در حال حذف…" });
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute("aria-busy", "true");
    fireEvent.click(action);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(change).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });
});
