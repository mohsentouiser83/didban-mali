import type { HTMLAttributes } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function LoadingState({ variant = "details", label, rows = 3, children, className, ...props }: HTMLAttributes<HTMLDivElement> & {
  variant?: "inline" | "chart" | "list" | "details" | "page";
  label?: string;
  rows?: number;
}) {
  const message = label ?? (typeof children === "string" ? children : "در حال دریافت اطلاعات…");
  return <div role="status" aria-busy="true" aria-label={message} data-slot="loading-state" data-variant={variant} className={cn("min-w-0", variant === "inline" ? "flex items-center gap-2 py-1 text-sm text-muted-foreground" : "grid gap-4", className)} {...props}>
    {variant === "inline" ? <><Spinner aria-hidden="true" role="presentation" /><span>{children ?? message}</span></> : <>
      <span className="sr-only">{message}</span>
      {children ?? (variant === "chart" ? <div aria-hidden="true" className="grid h-72 grid-rows-[1fr_auto] gap-4 rounded-[var(--ds-card-radius)] border border-border p-4 sm:h-80"><Skeleton className="h-full w-full" /><div className="flex justify-between">{[0,1,2].map((index) => <Skeleton key={index} className="h-3 w-12" />)}</div></div> : variant === "page" ? <><Skeleton className="h-12 w-48" /><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0,1,2,3].map((index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="h-80 w-full" /></> : Array.from({ length: rows }, (_, index) => <Skeleton key={index} className={variant === "list" ? "h-16 w-full" : "h-24 w-full"} />))}
    </>}
  </div>;
}
