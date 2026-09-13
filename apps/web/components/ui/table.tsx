import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <div className="w-full overflow-x-auto"><table className={cn("w-full min-w-[720px] border-collapse text-sm", className)} {...props} /></div>;
}
function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-[var(--ds-table-header)] text-[var(--ds-foreground-soft)]", className)} {...props} />;
}
function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}
function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-[var(--ds-border)] transition-colors hover:bg-[var(--ds-table-hover)]", className)} {...props} />;
}
function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("h-11 px-4 text-start text-sm font-bold whitespace-nowrap", className)} {...props} />;
}
function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("h-12 px-4 text-start whitespace-nowrap", className)} {...props} />;
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
