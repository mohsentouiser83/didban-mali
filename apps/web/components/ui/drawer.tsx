"use client";

import { createElement, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "./sheet";
import { Form } from "./form";
import { TruncatedText } from "./tooltip";
import { fieldIcon } from "./field-layout";
import { cn } from "@/lib/utils";

export function Drawer({ open, onOpenChange, title, description, children, className, titleIcon, size = "compact", closeDisabled = false, onCloseAutoFocus }: {
  open: boolean;
  closeDisabled?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  titleIcon?: ReactNode;
  size?: "compact" | "wide";
}) {
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" dir="rtl" closeDisabled={closeDisabled} onCloseAutoFocus={onCloseAutoFocus} onEscapeKeyDown={(event) => { if (closeDisabled) event.preventDefault(); }} onPointerDownOutside={(event) => { if (closeDisabled) event.preventDefault(); }} className={cn("financial-drawer !w-full !max-w-none md:!w-[min(540px,60vw)] !flex !flex-col !gap-0 !p-0 overflow-hidden bg-background text-foreground motion-reduce:!animate-none", size === "wide" && "md:!w-[min(960px,88vw)]", className)}
    >
      <SheetHeader className="shrink-0 min-w-0 border-b border-border py-5 ps-5 pe-16 text-start [&_h2]:break-words [&_h2]:text-lg [&_h2]:leading-relaxed"><SheetTitle className="flex items-start gap-3"><span aria-hidden="true" className="mt-0.5 shrink-0 text-primary">{titleIcon ?? createElement(fieldIcon(title), { size: 24 })}</span><span className="min-w-0 flex-1"><TruncatedText text={title} /></span></SheetTitle><SheetDescription className="sr-only">{description || title}</SheetDescription></SheetHeader>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-7 overflow-y-auto overscroll-contain bg-muted/15 px-5 pt-6 sm:px-8 [&>*:last-child]:mb-5">{children}</div>
    </SheetContent>
  </Sheet>;
}

export function DrawerForm({ className, ...props }: ComponentPropsWithoutRef<"form">) {
  return <Form className={cn("flex min-w-0 flex-1 flex-col gap-5 [&_label]:mb-2 [&_label]:flex [&_label]:text-sm [&_label]:leading-relaxed", className)} {...props} />;
}

export function DrawerFooter({ children }: { children: ReactNode }) {
  return <SheetFooter className="sticky bottom-0 z-10 !mt-auto !flex !flex-row !flex-wrap !justify-end gap-2 border-t border-border bg-background py-4 [&>*]:!m-0">{children}</SheetFooter>;
}
