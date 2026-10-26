"use client";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, FileText } from "@/components/ui/icons";

export function ReviewDisclosure({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <div className="min-w-0">
    <Button variant="ghost" className="min-h-11 w-full justify-between gap-3 px-0 text-sm text-muted-foreground" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <span className="flex items-center gap-2"><FileText size={17} aria-hidden="true" />{title}</span>
      <ChevronDown size={16} aria-hidden="true" className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
    </Button>
    <div id={id} hidden={!open} className="min-w-0 pt-2 text-sm leading-loose text-muted-foreground [overflow-wrap:anywhere] motion-safe:animate-[workspace-enter_200ms_ease-out_both]">{children}</div>
  </div>;
}

