import { cn } from "@/lib/utils";
import { type ComponentProps } from "react";
import { EmptyState } from "./content-states";
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div
      className="@container/table min-w-0 w-full max-w-full overflow-x-auto overscroll-x-contain [contain:layout] rounded-control focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2 border border-border"
      tabIndex={0}
      role="region"
      aria-label="جدول اطلاعات"
    >
      <table
        {...props}
        className={cn("w-full border-collapse text-start text-sm has-[tbody_td:not([colspan])]:min-w-[640px]", className)}
      />
    </div>
  );
}
export function TableHeader(props: ComponentProps<"thead">) {
  return (
    <thead {...props} className={cn("bg-canvas text-muted", props.className)} />
  );
}
export function TableBody(props: ComponentProps<"tbody">) {
  return (
    <tbody
      {...props}
      className={cn("divide-y divide-border bg-surface motion-safe:animate-fade-in", props.className)}
    />
  );
}
export function TableRow(props: ComponentProps<"tr">) {
  return (
    <tr
      {...props}
      className={cn(
        "transition-colors duration-200 ease-interface hover:bg-primary-soft/30 has-[:focus-visible]:bg-primary-soft/30 motion-reduce:transition-none",
        props.className,
      )}
    />
  );
}
export function TableHead(props: ComponentProps<"th">) {
  return (
    <th
      {...props}
      scope="col"
      className={cn(
        "whitespace-nowrap px-4 py-3 text-start font-medium",
        props.className,
      )}
    />
  );
}
export function TableCell(props: ComponentProps<"td">) {
  return (
    <td
      {...props}
      className={cn("px-4 py-4 text-start tabular-nums", props.className)}
    />
  );
}
export function TableRowHeader(props: ComponentProps<"th">) {
  return (
    <th
      {...props}
      scope="row"
      className={cn("px-4 py-4 text-start font-normal", props.className)}
    />
  );
}
export function TableEmptyCell({
  colSpan,
  title = "هنوز داده‌ای ثبت نشده",
  action,
}: {
  colSpan: number;
  title?: string;
  action?: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="sticky start-0 w-[100cqw] max-w-full"><EmptyState title={title} action={action} /></div>
      </td>
    </tr>
  );
}
