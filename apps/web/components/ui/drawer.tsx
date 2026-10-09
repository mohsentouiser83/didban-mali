"use client";

import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "./sheet";
import { cn } from "@/lib/utils";
import styles from "./drawer.module.css";

export function Drawer({ open, onOpenChange, title, description, children, className }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="left" dir="rtl" className={cn(styles.drawer, className)}>
      <SheetHeader className={styles.header}><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader>
      {children}
    </SheetContent>
  </Sheet>;
}

export function DrawerFooter({ children }: { children: ReactNode }) {
  return <SheetFooter className={styles.footer}>{children}</SheetFooter>;
}
