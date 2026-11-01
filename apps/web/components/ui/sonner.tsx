"use client";
import { Toaster as Primitive, toast } from "sonner";
export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message, { duration: Infinity }),
  info: (message: string) => toast.info(message),
};
export function Toaster() {
  return (
    <Primitive
      dir="rtl"
      position="bottom-left"
      closeButton
      toastOptions={{
        closeButtonAriaLabel: "بستن اعلان",
        classNames: {
          toast:
            "!font-body !rounded-control !border-border !bg-surface !text-foreground !shadow-overlay",
          closeButton: "!size-11 !border-border !bg-surface !text-muted",
        },
        descriptionClassName: "!text-muted",
      }}
    />
  );
}
