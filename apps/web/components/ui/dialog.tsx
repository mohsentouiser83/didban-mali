"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "@/components/ui/icons";
import type { ComponentProps, HTMLAttributes } from "react";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import { useOverlayFocus } from "./use-overlay-focus";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-[rgb(24_45_59_/_32%)] modal-overlay-animated",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  ComponentProps<typeof DialogPrimitive.Content> & { closeDisabled?: boolean }
>(({ className, children, closeDisabled, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
  const focus = useOverlayFocus(onOpenAutoFocus, onCloseAutoFocus);
  return (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      data-slot="dialog-content"
      ref={ref}
      dir="rtl"
      className={cn(
        "fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto -translate-x-1/2 -translate-y-1/2 gap-5 rounded-[var(--ds-p-radius-xl)] border border-[var(--ds-border-strong)] bg-[var(--ds-surface-elevated)] p-6 text-[var(--ds-foreground)] shadow-[var(--ds-shadow-xl)] modal-content-animated",
        className
      )}
      {...props}
      {...focus}
    >
      {children}
      <DialogPrimitive.Close asChild>
        <Button type="button" variant="ghost" size="icon" disabled={closeDisabled}
          className="absolute end-3 top-3" aria-label="بستن پنجره">
          <X aria-hidden="true" />
        </Button>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-1.5 pe-10 text-start", className)} {...props} />;
}

function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-start sm:flex-row-reverse border-t border-[var(--ds-border)] pt-4 mt-2", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-lg font-bold text-[var(--ds-foreground)]", className)} {...props} />;
}

function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm leading-relaxed text-[var(--ds-foreground-soft)]", className)} {...props} />;
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
