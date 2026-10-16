"use client";

import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "./sheet";
import { Form } from "./form";
import { cn } from "@/lib/utils";

export function Drawer({ open, onOpenChange, title, description, children, className }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" dir="rtl" className={cn("financial-drawer !w-full !max-w-none md:!w-[min(540px,60vw)] !flex !flex-col !gap-0 !p-0 overflow-hidden bg-background text-foreground motion-reduce:!animate-none", className)}
    >
      <SheetHeader className="shrink-0 min-w-0 border-b border-border py-5 ps-5 pe-16 text-start [&_h2]:break-words [&_h2]:text-lg [&_h2]:leading-relaxed"><SheetTitle>{title}</SheetTitle><SheetDescription className="sr-only">{description || title}</SheetDescription></SheetHeader>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 pt-5 [&>*:last-child]:mb-5">{children}</div>
    </SheetContent>
  </Sheet>;
}

export function DrawerSection({ title, children, className, ...props }: ComponentPropsWithoutRef<"section"> & { title?: string }) {
  return <section className={cn("flex min-w-0 flex-col gap-4 [&+section]:border-t [&+section]:border-border [&+section]:pt-5", className)} {...props}>
    {title && <h3 className="text-sm font-medium leading-relaxed">{title}</h3>}
    {children}
  </section>;
}

export function DrawerDetails({ className, ...props }: ComponentPropsWithoutRef<"dl">) {
  return <dl className={cn("grid min-w-0 gap-4 text-sm leading-relaxed [&>div]:flex [&>div]:min-w-0 [&>div]:items-baseline [&>div]:justify-between [&>div]:gap-5 [&_dt]:text-muted-foreground [&_dt]:break-words [&_dd]:min-w-0 [&_dd]:break-words [&_dd]:text-end", className)} {...props} />;
}

export function DrawerForm({ className, ...props }: ComponentPropsWithoutRef<"form">) {
  return <Form className={cn("flex min-w-0 flex-1 flex-col gap-5 [&_label]:mb-2 [&_label]:block [&_label]:text-sm [&_label]:leading-relaxed", className)} {...props} />;
}

export function DrawerFooter({ children }: { children: ReactNode }) {
  return <SheetFooter className="sticky bottom-0 z-10 !mt-auto !flex !flex-row !flex-wrap !justify-end gap-2 border-t border-border bg-background py-4 [&>*]:!m-0">{children}</SheetFooter>;
}
