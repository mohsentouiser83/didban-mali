"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

export type TabsVariant = "segmented" | "line" | "pills"
export type TabsSize = "xs" | "sm" | "default" | "lg"

interface TabsContextValue {
  variant: TabsVariant
  size: TabsSize
}

const TabsContext = React.createContext<TabsContextValue>({
  variant: "segmented",
  size: "default",
})

export interface TabsProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  variant?: TabsVariant
  size?: TabsSize
}

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  TabsProps
>(({ dir = "rtl", variant = "segmented", size = "default", children, ...props }, ref) => {
  const contextValue = React.useMemo(
    () => ({
      variant: variant ?? "segmented",
      size: size ?? "default",
    }),
    [variant, size]
  )

  return (
    <TabsContext.Provider value={contextValue}>
      <TabsPrimitive.Root ref={ref} dir={dir} {...props}>
        {children}
      </TabsPrimitive.Root>
    </TabsContext.Provider>
  )
})
Tabs.displayName = TabsPrimitive.Root.displayName

const tabsListVariants = cva(
  "inline-flex items-center text-[var(--ds-muted-fg)] transition-all",
  {
    variants: {
      variant: {
        segmented:
          "rounded-xl bg-[var(--ds-muted-bg)] p-1 border border-[var(--ds-border)] justify-center",
        line:
          "w-full justify-start rounded-none border-b border-[var(--ds-border)] bg-transparent p-0",
        pills:
          "flex-wrap bg-transparent p-0 border-none justify-start",
      },
      size: {
        xs: "gap-0.5",
        sm: "gap-1",
        default: "gap-1.5",
        lg: "gap-2",
      },
    },
    compoundVariants: [
      {
        variant: "segmented",
        size: "xs",
        className: "h-7 p-0.5 rounded-lg",
      },
      {
        variant: "segmented",
        size: "sm",
        className: "h-9 p-1 rounded-lg",
      },
      {
        variant: "segmented",
        size: "default",
        className: "h-11 p-1 rounded-xl",
      },
      {
        variant: "segmented",
        size: "lg",
        className: "h-12 p-1.5 rounded-xl",
      },
      {
        variant: "line",
        size: "xs",
        className: "h-8 gap-3",
      },
      {
        variant: "line",
        size: "sm",
        className: "h-9 gap-4",
      },
      {
        variant: "line",
        size: "default",
        className: "h-11 gap-6",
      },
      {
        variant: "line",
        size: "lg",
        className: "h-12 gap-8",
      },
      {
        variant: "pills",
        size: "xs",
        className: "gap-1.5",
      },
      {
        variant: "pills",
        size: "sm",
        className: "gap-2",
      },
      {
        variant: "pills",
        size: "default",
        className: "gap-2.5",
      },
      {
        variant: "pills",
        size: "lg",
        className: "gap-3",
      },
    ],
    defaultVariants: {
      variant: "segmented",
      size: "default",
    },
  }
)

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>,
    VariantProps<typeof tabsListVariants> {}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant = "segmented", size = "default", children, ...props }, ref) => {
  const contextValue = React.useMemo(
    () => ({
      variant: variant ?? "segmented",
      size: size ?? "default",
    }),
    [variant, size]
  )

  return (
    <TabsContext.Provider value={contextValue}>
      <TabsPrimitive.List
        ref={ref}
        className={cn(tabsListVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </TabsPrimitive.List>
    </TabsContext.Provider>
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

const tabsTriggerVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 select-none",
  {
    variants: {
      variant: {
        segmented:
          "text-[var(--ds-foreground-soft)] hover:text-[var(--ds-foreground)] data-[state=active]:bg-[var(--ds-surface-elevated)] data-[state=active]:text-[var(--ds-foreground)] data-[state=active]:shadow-sm data-[state=active]:font-bold",
        line:
          "border-b-2 border-transparent -mb-px text-[var(--ds-muted-fg)] hover:text-[var(--ds-foreground)] data-[state=active]:border-[var(--ds-primary)] data-[state=active]:text-[var(--ds-primary)] data-[state=active]:font-bold bg-transparent shadow-none rounded-none",
        pills:
          "rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-subtle)] text-[var(--ds-foreground-soft)] hover:bg-[var(--ds-surface-elevated)] hover:text-[var(--ds-foreground)] data-[state=active]:bg-[var(--ds-primary-subtle)] data-[state=active]:border-[var(--ds-primary)] data-[state=active]:text-[var(--ds-primary)] data-[state=active]:font-bold",
        accent:
          "border-b-2 border-transparent -mb-px text-[var(--ds-muted-fg)] hover:text-[var(--ds-foreground)] data-[state=active]:border-[var(--ds-accent)] data-[state=active]:text-[var(--ds-accent)] data-[state=active]:font-bold bg-transparent shadow-none rounded-none",
      },
      size: {
        xs: "gap-1 text-[11px]",
        sm: "gap-1.5 text-xs",
        default: "gap-2 text-sm",
        lg: "gap-2 text-base",
      },
    },
    compoundVariants: [
      {
        variant: "segmented",
        size: "xs",
        className: "h-6 px-2 rounded-md",
      },
      {
        variant: "segmented",
        size: "sm",
        className: "h-7 px-2.5 rounded-md",
      },
      {
        variant: "segmented",
        size: "default",
        className: "h-9 px-3.5 rounded-lg",
      },
      {
        variant: "segmented",
        size: "lg",
        className: "h-10 px-4 rounded-lg",
      },
      {
        variant: "line",
        size: "xs",
        className: "py-1 px-1",
      },
      {
        variant: "line",
        size: "sm",
        className: "py-1.5 px-1.5",
      },
      {
        variant: "line",
        size: "default",
        className: "py-2 px-2",
      },
      {
        variant: "line",
        size: "lg",
        className: "py-2.5 px-2.5",
      },
      {
        variant: "accent",
        size: "xs",
        className: "py-1 px-1",
      },
      {
        variant: "accent",
        size: "sm",
        className: "py-1.5 px-1.5",
      },
      {
        variant: "accent",
        size: "default",
        className: "py-2 px-2",
      },
      {
        variant: "accent",
        size: "lg",
        className: "py-2.5 px-2.5",
      },
      {
        variant: "pills",
        size: "xs",
        className: "h-6 px-2.5 text-[11px]",
      },
      {
        variant: "pills",
        size: "sm",
        className: "h-7 px-3 text-xs",
      },
      {
        variant: "pills",
        size: "default",
        className: "h-8 px-3.5 text-sm",
      },
      {
        variant: "pills",
        size: "lg",
        className: "h-10 px-4 text-base",
      },
    ],
    defaultVariants: {
      variant: "segmented",
      size: "default",
    },
  }
)

export interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>,
    VariantProps<typeof tabsTriggerVariants> {}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, variant: propVariant, size: propSize, ...props }, ref) => {
  const context = React.useContext(TabsContext)
  const variant = propVariant ?? context.variant ?? "segmented"
  const size = propSize ?? context.size ?? "default"

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(tabsTriggerVariants({ variant, size }), className)}
      {...props}
    />
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-ring)] focus-visible:ring-offset-2 transition-all",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants, tabsTriggerVariants }
