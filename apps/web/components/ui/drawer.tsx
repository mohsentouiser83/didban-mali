"use client";

import { useRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
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
  const opener = useRef<HTMLElement | null>(null);
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="left" dir="rtl" className={cn(styles.width, styles.drawer, className)}
      onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={(event) => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } }}
    >
      <SheetHeader className={styles.header}><SheetTitle>{title}</SheetTitle><SheetDescription className="sr-only">{description}</SheetDescription></SheetHeader>
      <div className={styles.body}>{children}</div>
    </SheetContent>
  </Sheet>;
}

export function DrawerSection({ title, children, className, ...props }: ComponentPropsWithoutRef<"section"> & { title?: string }) {
  return <section className={cn(styles.section, className)} {...props}>
    {title && <h3 className={styles.sectionTitle}>{title}</h3>}
    {children}
  </section>;
}

export function DrawerDetails({ className, ...props }: ComponentPropsWithoutRef<"dl">) {
  return <dl className={cn(styles.details, className)} {...props} />;
}

export function DrawerForm({ className, ...props }: ComponentPropsWithoutRef<"form">) {
  return <form className={cn(styles.form, className)} {...props} />;
}

export function DrawerFooter({ children }: { children: ReactNode }) {
  return <SheetFooter className={styles.footer}>{children}</SheetFooter>;
}
