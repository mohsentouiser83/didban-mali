"use client";
import type { ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Button } from "./button";
import { ChevronDown } from "./icons";

export function Disclosure({ title, children, open, onOpenChange }: { title: string; children: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return <Collapsible.Root open={open} onOpenChange={onOpenChange} className="min-w-0 border-t border-border pt-4">
    <Collapsible.Trigger asChild><Button type="button" variant="ghost" className="group min-h-11 w-full justify-between">{title}<ChevronDown aria-hidden="true" className="size-4 group-data-[state=open]:rotate-180 motion-safe:transition-transform motion-reduce:transition-none" /></Button></Collapsible.Trigger>
    <Collapsible.Content className="space-y-5 pt-4 data-[state=open]:motion-safe:animate-[workspace-enter_180ms_ease-out_both]">{children}</Collapsible.Content>
  </Collapsible.Root>;
}
