"use client";
import { cn } from "@/lib/utils";
import { InfoIcon } from "@phosphor-icons/react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";
export function Tooltip({
  children,
  content,
  disabled = false,
}: {
  children: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root open={open && !disabled} onOpenChange={setOpen}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            dir="rtl"
            sideOffset={6}
            className="z-100 max-w-72 rounded-control bg-foreground px-3 py-2 text-xs leading-6 text-white shadow-overlay"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-foreground" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
export const ActionTooltip = Tooltip;
export function Hint({
  children,
  label = "جزئیات",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <Button variant="ghost" aria-label={label} className="size-11 p-0">
          <InfoIcon size={19} />
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          dir="rtl"
          sideOffset={6}
          onEscapeKeyDown={(event) => event.stopPropagation()}
          className="z-100 max-w-80 rounded-control border border-border bg-surface p-4 text-sm leading-7 shadow-overlay"
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
export function TruncatedText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setClipped(node.scrollWidth > node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [children, clipped]);
  const text = (
    <span ref={ref} className={cn("block min-w-0 max-w-full truncate", className)}>
      {children}
    </span>
  );
  if (!clipped) return text;
  return (
    <PopoverPrimitive.Root open={expanded} onOpenChange={setExpanded}>
      <Tooltip content={children} disabled={expanded}>
        <PopoverPrimitive.Trigger asChild>
          <Button
            variant="ghost"
            className="h-6 min-h-0 w-full min-w-0 max-w-full justify-start rounded-sm p-0 text-start font-normal leading-6 hover:bg-transparent"
            aria-label={children}
          >
            {text}
          </Button>
        </PopoverPrimitive.Trigger>
      </Tooltip>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          dir="rtl"
          sideOffset={6}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.stopPropagation()}
          className="z-100 max-w-[min(20rem,calc(100vw-2rem))] break-words rounded-control border border-border bg-surface p-3 text-sm leading-7 shadow-overlay"
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
