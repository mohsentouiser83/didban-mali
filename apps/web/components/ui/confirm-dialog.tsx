"use client";
import { Trash2, X } from "./icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  busy,
  onConfirm,
  confirmLabel = "حذف",
  busyLabel = "در حال حذف…",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  busy: boolean;
  onConfirm: () => void;
  confirmLabel?: string;
  busyLabel?: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent dir="rtl" closeDisabled={busy}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden="true" />انصراف
          </Button>
          <Button type="button" variant="destructive" loading={busy} loadingText={busyLabel} onClick={onConfirm}>
            <Trash2 aria-hidden="true" />{confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
