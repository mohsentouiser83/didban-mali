"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof TooltipPrimitive.Content>) {
  return <TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={sideOffset} className={cn("z-50 rounded-lg bg-[var(--ds-foreground)] px-3 py-2 text-xs text-[var(--ds-background)] shadow-[var(--ds-shadow-md)]", className)} {...props} /></TooltipPrimitive.Portal>;
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
