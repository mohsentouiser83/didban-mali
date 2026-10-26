import { EmptyState } from "./states";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./button";
export function Table({ children, ...props }: ComponentProps<"table">) {
  return (
    <div
      className="max-w-full overflow-x-auto rounded-panel border border-border bg-surface"
      role="region"
      aria-label="جدول اطلاعات"
      tabIndex={0}
    >
      <table className="w-full text-start text-sm" {...props}>
        {children}
      </table>
    </div>
  );
}
export function TableHeader(p: ComponentProps<"thead">) {
  return <thead className="bg-background/70 text-muted" {...p} />;
}
export function TableBody(p: ComponentProps<"tbody">) {
  return <tbody className="divide-y divide-border" {...p} />;
}
export function TableRow(p: ComponentProps<"tr">) {
  return (
    <tr
      className="transition-colors duration-200 hover:bg-background/60"
      {...p}
    />
  );
}
export function TableHead({ className, ...p }: ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cx(
        "px-5 py-4 text-start font-medium whitespace-nowrap",
        className,
      )}
      {...p}
    />
  );
}
export function TableRowHeader({ className, ...p }: ComponentProps<"th">) {
  return (
    <th
      scope="row"
      className={cx("px-5 py-4 text-start font-medium", className)}
      {...p}
    />
  );
}
export function TableCell({ className, ...p }: ComponentProps<"td">) {
  return <td className={cx("px-5 py-4", className)} {...p} />;
}

export function TableEmptyCell({
  colSpan,
  title,
  description,
  action,
}: {
  colSpan: number;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <TableCell colSpan={colSpan}>
      <EmptyState title={title} description={description} action={action} />
    </TableCell>
  );
}
