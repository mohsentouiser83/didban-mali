"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger
const TooltipArrow = TooltipPrimitive.Arrow

export interface TooltipContentProps
  extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  showArrow?: boolean
}

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(({ className, sideOffset = 6, showArrow = true, collisionPadding = 8, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      data-slot="tooltip-content"
      dir="rtl"
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        "max-w-[min(24rem,calc(100vw-2rem))] whitespace-normal break-words text-start leading-relaxed motion-reduce:animate-none z-50 overflow-hidden rounded border border-[var(--ds-border-strong)] bg-[var(--ds-foreground)] px-3 py-1.5 text-xs text-[var(--ds-p-white)] shadow-lg select-none animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    >
      {children}
      {showArrow && (
        <TooltipPrimitive.Arrow className="fill-[var(--ds-foreground)]" />
      )}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, TooltipArrow }

/** A shared text hint that also opens with touch, Enter, or Space. */
export function Hint({ content, children, side = "top", interactive = true }: {
  content: string | undefined;
  children: React.ReactElement;
  side?: TooltipContentProps["side"];
  interactive?: boolean;
}) {
  const [open, setOpen] = React.useState(false)
  if (!content) return children
  if (!interactive) return <ActionTooltip content={content}>{children}</ActionTooltip>
  return <TooltipProvider delayDuration={250}>
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild data-slot="hint-trigger" className="rounded focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2" role="button" tabIndex={0} aria-label={content}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen((value) => !value) }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault(); event.stopPropagation(); setOpen((value) => !value)
          }
        }}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
}

/** Hover/focus description for a control whose click already performs an action. */
export function ActionTooltip({ content, children }: { content: string; children: React.ReactElement }) {
  return <TooltipProvider delayDuration={250}><Tooltip>
    <TooltipTrigger asChild aria-label={content}>{children}</TooltipTrigger>
    <TooltipContent>{content}</TooltipContent>
  </Tooltip></TooltipProvider>
}

/** Only truncated text needs an extra focus stop to disclose its full value. */
export function TruncatedText({ text, className }: { text: string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [truncated, setTruncated] = React.useState(false)
  React.useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setTruncated(element.scrollWidth > element.clientWidth + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text, truncated])
  const value = <span ref={ref} className={cn("block min-w-0 truncate", className)}><bdi>{text}</bdi></span>
  return truncated ? <Hint content={text}>{value}</Hint> : value
}
