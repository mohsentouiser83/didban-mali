"use client";

import { Toaster as Sonner, toast, type ExternalToast } from "sonner";
import { CheckCircle2, AlertCircle, Info, X } from "@/components/ui/icons";

type ToasterProps = Omit<React.ComponentProps<typeof Sonner>, "theme" | "richColors" | "dir" | "icons" | "toastOptions">;

/** One notification entry point; material failures stay until explicitly dismissed. */
export const notify = {
  success: (message: string, options?: ExternalToast) => toast.success(message, { id: `success:${message}`, ...options }),
  info: (message: string, options?: ExternalToast) => toast.info(message, { id: `info:${message}`, ...options }),
  error: (message: string, options?: ExternalToast) => toast.error(message, { id: `error:${message}`, duration: Infinity, ...options }),
  dismiss: toast.dismiss,
};

export function Toaster(props: ToasterProps) {
  return <Sonner dir="rtl" position="top-center" duration={6000} closeButton visibleToasts={3} containerAriaLabel="اعلان‌ها" {...props} theme="light" richColors={false}
    icons={{ success: <CheckCircle2 aria-hidden="true" className="size-5" />, error: <AlertCircle aria-hidden="true" className="size-5" />, info: <Info aria-hidden="true" className="size-5" />, close: <X aria-hidden="true" className="size-4" /> }}
    toastOptions={{ unstyled: true, closeButtonAriaLabel: "بستن اعلان", classNames: {
      toast: "relative flex w-full min-w-0 items-start gap-3 rounded-[var(--ds-card-radius)] border border-border bg-card p-4 pe-14 font-sans text-sm leading-relaxed text-foreground shadow-lg [overflow-wrap:anywhere]",
      title: "font-medium", content: "min-w-0 flex-1", description: "mt-1 text-xs text-muted-foreground",
      icon: "mt-0.5 shrink-0", success: "border-[var(--ds-success)]/30 [&>[data-icon]]:text-[var(--ds-success)]", error: "border-destructive/30 [&>[data-icon]]:text-destructive", info: "[&>[data-icon]]:text-primary",
      closeButton: "!absolute !start-auto !end-0 !top-0 !m-0 !size-11 !translate-x-0 !translate-y-0 cursor-pointer rounded-lg border-0 bg-transparent text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary",
      actionButton: "min-h-11 rounded-lg bg-primary px-3 text-primary-foreground", cancelButton: "min-h-11 rounded-lg bg-muted px-3 text-foreground",
    } }} />;
}
