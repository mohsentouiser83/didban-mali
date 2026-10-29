"use client";
import { Dialog as Primitive, AlertDialog } from "radix-ui";
import { AppIcon, IconTile, type AppIconName } from "./app-icon";
import { X } from "lucide-react";
import { useRef, type ReactNode, type RefObject } from "react";
import { Button, cx } from "./button";
export function Dialog({
  open,
  onOpenChange,
  title,
  icon = "ClipboardList",
  description,
  trigger,
  children,
  busy = false,
  returnFocusRef,
  size = "default",
}: {
  busy?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  size?: "default" | "wide";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  icon?: AppIconName;
  description?: string;
  trigger?: ReactNode;
  children: ReactNode;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Primitive.Root
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      {trigger ? (
        <Primitive.Trigger asChild>{trigger}</Primitive.Trigger>
      ) : null}
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-xs" />
        <Primitive.Content
          aria-busy={busy}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (busy) e.preventDefault();
          }}
          dir="rtl"
          aria-describedby={description ? undefined : undefined}
          onOpenAutoFocus={() => {
            opener.current = document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(e) => {
            const target = returnFocusRef?.current ?? opener.current;
            if (target?.isConnected) {
              e.preventDefault();
              target.focus();
            }
          }}
          className={cx(
            "fixed start-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-40px)] -translate-y-1/2 translate-x-1/2 overflow-y-auto rounded-summary border border-border bg-surface p-5 shadow-float sm:p-7 motion-safe:animate-dialog",
            size === "wide" ? "max-w-4xl" : "max-w-lg",
          )}
        >
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <Primitive.Title className="flex items-center gap-3 font-heading text-xl font-medium">
                <IconTile name={icon} />
                {title}
              </Primitive.Title>
              {description ? (
                <Primitive.Description className="mt-2 text-sm text-muted">
                  {description}
                </Primitive.Description>
              ) : null}
            </div>
            <Primitive.Close asChild>
              <Button
                disabled={busy}
                variant="ghost"
                className="-mt-2 -me-2 px-3"
                aria-label="بستن پنجره"
              >
                <X size={18} />
              </Button>
            </Primitive.Close>
          </div>
          {children}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children?: ReactNode;
  onConfirm: () => void;
  busy: boolean;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-xs" />
        <AlertDialog.Content
          onOpenAutoFocus={() => {
            opener.current = document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(e) => {
            if (opener.current?.isConnected) {
              e.preventDefault();
              opener.current.focus();
            }
          }}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          dir="rtl"
          className="fixed start-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-40px)] max-w-md -translate-y-1/2 translate-x-1/2 overflow-y-auto rounded-summary border border-border bg-surface p-7 shadow-float motion-safe:animate-dialog"
        >
          <AlertDialog.Title className="flex items-center gap-3 font-heading text-xl font-medium">
            <IconTile name="ShieldCheck" />
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="my-4 text-muted">
            {description}
          </AlertDialog.Description>
          {children}
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={busy}>
                <AppIcon name="X" />
                انصراف
              </Button>
            </AlertDialog.Cancel>
            <Button variant="danger" onClick={onConfirm} disabled={busy}>
              <AppIcon name="Check" />
              {busy ? "در حال ثبت…" : "تأیید تغییر"}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
