"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps, HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in" /><DialogPrimitive.Content dir="rtl" className={cn("fixed start-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 rounded-[var(--ds-card-radius)] border border-[var(--ds-border)] bg-[var(--ds-card-solid)] p-6 text-[var(--ds-foreground)] shadow-[var(--ds-shadow-md)]", className)} {...props}>{children}<DialogPrimitive.Close className="ds-focus absolute end-4 top-4 grid size-9 place-items-center rounded-lg text-[var(--ds-foreground-soft)] hover:bg-[var(--ds-muted)]" aria-label="بستن پنجره"><X className="size-4" /></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>;
}
function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("space-y-2 pe-8", className)} {...props} />; }
function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />; }
function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) { return <DialogPrimitive.Title className={cn("text-lg font-extrabold", className)} {...props} />; }
function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) { return <DialogPrimitive.Description className={cn("text-sm leading-7 text-[var(--ds-foreground-soft)]", className)} {...props} />; }

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger };
