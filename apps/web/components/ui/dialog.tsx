"use client";
import { cn } from "@/lib/utils";
import { XIcon } from "@phosphor-icons/react";
import * as Primitive from "@radix-ui/react-dialog";
import { useRef, type ReactNode } from "react";
import { Button } from "./button";
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  sheet = false,
  modal = true,
  bodyClassName,
  headerClassName,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  sheet?: boolean;
  modal?: boolean;
  bodyClassName?: string;
  headerClassName?: string;
  className?: string;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <Primitive.Portal>
        {modal && (
          <Primitive.Overlay
            className={cn(
              "fixed inset-0 z-50 bg-foreground/25 data-[state=open]:animate-fade-in motion-reduce:animate-none!",
              sheet && "data-[state=closed]:animate-drawer-backdrop-out",
            )}
          />
        )}
        <Primitive.Content
          dir="rtl"
          onFocusOutside={modal ? undefined : (event) => event.preventDefault()}
          onOpenAutoFocus={() => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
          }}
          className={cn(
            "fixed z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] flex-col overflow-hidden border border-border bg-surface p-5 shadow-overlay outline-none sm:p-7 motion-reduce:animate-none!",
            sheet
              ? "inset-y-4 end-4 h-[calc(100dvh-2rem)] max-w-lg rounded-dialog data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out data-[state=closed]:pointer-events-none"
              : "start-1/2 top-1/2 max-w-xl translate-x-1/2 -translate-y-1/2 rounded-dialog data-[state=open]:animate-dialog-in",
            className,
          )}
        >
          <div className={cn("mb-5 flex items-start justify-between gap-4", headerClassName)}>
            <div>
              <Primitive.Title className="font-display text-xl font-medium">
                {title}
              </Primitive.Title>
              <Primitive.Description
                className={description ? "mt-2 text-sm text-muted" : "sr-only"}
              >
                {description || title}
              </Primitive.Description>
            </div>
            <Primitive.Close asChild>
              <Button variant="ghost" className="size-11 p-0" aria-label="بستن">
                <XIcon size={20} />
              </Button>
            </Primitive.Close>
          </div>
          <div className={cn("min-h-0 overflow-y-auto overscroll-contain pe-1", bodyClassName)}>
            {children}
          </div>
          {footer && (
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
              {footer}
            </div>
          )}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button variant="danger" busy={busy} onClick={onConfirm}>
            تأیید
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
