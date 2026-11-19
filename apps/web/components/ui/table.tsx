import { cn } from "@/lib/utils";
import { createContext, type ComponentProps } from "react";
import { EmptyState } from "./content-states";

export const TableContext = createContext<{ stickyFirstColumn?: boolean }>({});

export interface TableProps extends ComponentProps<"table"> {
  stickyFirstColumn?: boolean;
}

export function Table({
  className,
  stickyFirstColumn = false,
  children,
  ...props
}: TableProps) {
  return (
    <TableContext.Provider value={{ stickyFirstColumn }}>
      <div
        className="@container/table min-w-0 w-full max-w-full overflow-x-auto overscroll-x-contain [contain:layout] rounded-control focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2 border border-border"
        tabIndex={0}
        role="region"
        aria-label="جدول اطلاعات"
      >
        <table
          {...props}
          className={cn(
            "w-full border-collapse text-start text-sm has-[tbody_td:not([colspan])]:min-w-[640px]",
            stickyFirstColumn &&
              "[&_thead_th:first-child]:sticky [&_thead_th:first-child]:start-0 [&_thead_th:first-child]:z-10 [&_thead_th:first-child]:bg-surface [&_thead_th:first-child]:shadow-[1px_0_0_0_hsl(var(--border))] [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:start-0 [&_tbody_td:first-child]:z-10 [&_tbody_td:first-child]:bg-surface [&_tbody_td:first-child]:shadow-[1px_0_0_0_hsl(var(--border))] [&_tbody_th:first-child]:sticky [&_tbody_th:first-child]:start-0 [&_tbody_th:first-child]:z-10 [&_tbody_th:first-child]:bg-surface [&_tbody_th:first-child]:shadow-[1px_0_0_0_hsl(var(--border))]",
            className,
          )}
        >
          {children}
        </table>
      </div>
    </TableContext.Provider>
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
      className={cn(
        "divide-y divide-border bg-surface motion-safe:animate-fade-in",
        props.className,
      )}
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

export interface TableHeadProps extends ComponentProps<"th"> {
  stickyFirstColumn?: boolean;
}

export function TableHead({
  stickyFirstColumn,
  className,
  ...props
}: TableHeadProps) {
  return (
    <th
      {...props}
      scope="col"
      className={cn(
        "whitespace-nowrap px-4 py-3 text-start font-medium",
        stickyFirstColumn &&
          "sticky start-0 z-10 bg-surface shadow-[1px_0_0_0_hsl(var(--border))]",
        className,
      )}
    />
  );
}

export interface TableCellProps extends ComponentProps<"td"> {
  stickyFirstColumn?: boolean;
}

export function TableCell({
  stickyFirstColumn,
  className,
  ...props
}: TableCellProps) {
  return (
    <td
      {...props}
      className={cn(
        "px-4 py-4 text-start tabular-nums",
        stickyFirstColumn &&
          "sticky start-0 z-10 bg-surface shadow-[1px_0_0_0_hsl(var(--border))]",
        className,
      )}
    />
  );
}

export interface TableRowHeaderProps extends ComponentProps<"th"> {
  stickyFirstColumn?: boolean;
}

export function TableRowHeader({
  stickyFirstColumn,
  className,
  ...props
}: TableRowHeaderProps) {
  return (
    <th
      {...props}
      scope="row"
      className={cn(
        "px-4 py-4 text-start font-normal",
        stickyFirstColumn &&
          "sticky start-0 z-10 bg-surface shadow-[1px_0_0_0_hsl(var(--border))]",
        className,
      )}
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
        <div className="sticky start-0 w-[100cqw] max-w-full">
          <EmptyState title={title} action={action} />
        </div>
      </td>
    </tr>
  );
}
