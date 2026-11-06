"use client";
import { useState, type ReactNode } from "react";
import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "./button";
import { Drawer } from "./drawer";

/** A focused entry point for an editor alongside a list or report. */
export function DrawerAction({ title, action = title, busy = false, children }: {
  title: string;
  action?: string;
  busy?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <div className="flex justify-start">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <PlusIcon size={18} aria-hidden />{action}
      </Button>
    </div>
    <Drawer title={title} open={open} onOpenChange={value => { if (!busy) setOpen(value); }} className="sm:max-w-2xl">
      {children}
    </Drawer>
  </>;
}
