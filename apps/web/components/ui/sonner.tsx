"use client";
import { Toaster as Primitive, toast } from "sonner";
export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message, { duration: Infinity }),
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
            "!font-sans !bg-surface !text-foreground !border-border !rounded-control !shadow-float",
          closeButton: "!size-8 !bg-surface !border-border",
        },
      }}
    />
  );
}
