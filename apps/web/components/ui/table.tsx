"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { EmptyState } from "@/components/ui/financial/empty-state";
import { cn } from "@/lib/utils";

export type TableDensity = "compact" | "normal" | "spacious" | "default";

interface TableContextValue {
  density: TableDensity;
}

const TableContext = React.createContext<TableContextValue>({
  density: "normal",
});

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  density?: TableDensity;
  containerClassName?: string;
  containerRef?: React.Ref<HTMLDivElement>;
  containerProps?: React.HTMLAttributes<HTMLDivElement>;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, containerClassName, containerRef, containerProps, density = "normal", ...props }, ref) => {
    const normalizedDensity = density === "default" ? "normal" : density;

    return (
      <TableContext.Provider value={{ density: normalizedDensity }}>
        <div ref={containerRef} data-slot="table-container" tabIndex={0} role="region" aria-label={props["aria-label"] ?? "جدول داده‌ها"} {...containerProps} className={cn("@container/table relative min-w-0 max-w-full w-full focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2 overflow-x-auto rounded-none border border-[var(--ds-border)] bg-[var(--ds-card)] ", containerClassName)}>
          <table
            ref={ref}
            data-slot="table"
            className={cn("w-full min-w-[720px] border-collapse text-start [&_[data-slot=badge]]:max-w-none [&_[data-slot=badge]]:whitespace-nowrap", className)}
            {...props}
          />
        </div>
      </TableContext.Provider>
    );
  }
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }
>(({ className, sticky = true, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "border-b border-[var(--ds-border-strong)] bg-[var(--ds-table-header)] text-[var(--ds-foreground-soft)]",
      sticky && "sticky top-0 z-10",
      className
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement> & { loading?: boolean; transitionKey?: string | number }
>(({ className, loading = false, transitionKey = "", ...props }, ref) => (
  <tbody
    key={`${loading}:${transitionKey}`}
    aria-busy={loading}
    aria-label={loading ? "در حال دریافت ردیف‌ها" : undefined}
    ref={ref}
    className={cn("[&_tr:last-child]:border-0 motion-safe:animate-[workspace-enter_180ms_ease-out_both]", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t-2 border-[var(--ds-border-strong)] bg-[var(--ds-table-header)] font-bold text-[var(--ds-foreground)] [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** Opens the row detail; nested controls retain their own actions and keyboard focus. */
  onActivate?: () => void;
  selected?: boolean;
  risk?: "critical" | "high" | "medium" | "low";
}

const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, selected, risk, onActivate, onClick, ...props }, ref) => (
    <tr
      ref={ref}
      aria-selected={selected ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      data-risk={risk}
      data-interactive={onActivate || onClick ? "true" : undefined}
      tabIndex={onActivate ? -1 : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !onActivate) return;
        const target = event.target as HTMLElement;
        if (target.closest("button, a, input, select, textarea, [role=button], [role=checkbox], [role=switch], [data-row-action-ignore]")) return;
        if (window.getSelection()?.type === "Range") return;
        event.currentTarget.focus({ preventScroll: true });
        onActivate();
      }}
      className={cn(
        "group/row border-b border-[var(--ds-border)] transition-colors duration-150",
        (onActivate || onClick) && "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary hover:bg-muted/40 focus-within:bg-muted/40 active:bg-muted/60 motion-reduce:transition-none",
        selected && "bg-[var(--ds-table-selected)] shadow-[inset_3px_0_0_var(--ds-primary)]",
        risk === "critical" && "shadow-[inset_3px_0_0_var(--ds-danger)]",
        risk === "high" && "shadow-[inset_3px_0_0_var(--ds-warning)]",
        className
      )}
      {...props}
    />
  )
);
TableRow.displayName = "TableRow";

const tableHeadVariants = cva(
  "text-start font-bold whitespace-nowrap select-none align-middle text-[var(--ds-muted-fg)] transition-colors",
  {
    variants: {
      density: {
        compact: "h-9 px-3 text-xs",
        normal: "h-11 px-4 text-xs lg:text-sm",
        default: "h-11 px-4 text-xs lg:text-sm",
        spacious: "h-13 px-5 text-sm",
      },
    },
    defaultVariants: {
      density: "normal",
    },
  }
);

export interface TableHeadProps
  extends React.ThHTMLAttributes<HTMLTableCellElement>,
    VariantProps<typeof tableHeadVariants> {
  sortable?: boolean;
}

const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, density: propDensity, sortable, ...props }, ref) => {
    const context = React.useContext(TableContext);
    const density = propDensity ?? context.density ?? "normal";

    return (
      <th
        scope="col"
        ref={ref}
        className={cn(
          tableHeadVariants({ density }),
          sortable && "cursor-pointer hover:text-[var(--ds-foreground)]",
          className
        )}
        {...props}
      />
    );
  }
);
TableHead.displayName = "TableHead";

const tableCellVariants = cva(
  "whitespace-nowrap align-middle text-[var(--ds-foreground)] transition-colors",
  {
    variants: {
      density: {
        compact: "py-2 px-3 text-xs",
        normal: "py-3 px-4 text-xs lg:text-sm",
        default: "py-3 px-4 text-xs lg:text-sm",
        spacious: "py-4 px-5 text-sm",
      },
      numeric: {
        true: "text-end font-bold ds-persian-numerals tabular-nums",
        false: "text-start",
      },
    },
    defaultVariants: {
      density: "normal",
      numeric: false,
    },
  }
);

export interface TableCellProps
  extends React.TdHTMLAttributes<HTMLTableCellElement>,
    VariantProps<typeof tableCellVariants> {}

const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, density: propDensity, numeric = false, ...props }, ref) => {
    const context = React.useContext(TableContext);
    const density = propDensity ?? context.density ?? "normal";

    return (
      <td
        ref={ref}
        className={cn(tableCellVariants({ density, numeric }), className)}
        {...props}
      />
    );
  }
);
TableCell.displayName = "TableCell";

/** Keeps empty-result copy visible even when the column headers need horizontal scrolling. */
const TableEmptyCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ children, className, ...props }, ref) => <TableCell ref={ref} className={cn("p-0 text-center text-muted-foreground", className)} {...props}>
    <EmptyState variant="compact" className="sticky start-0 w-[100cqw] max-w-full whitespace-normal">{children}</EmptyState>
  </TableCell>,
);
TableEmptyCell.displayName = "TableEmptyCell";

const TableRowHeader = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement> & { density?: TableDensity }>(
  ({ className, density: propDensity, ...props }, ref) => {
    const { density } = React.useContext(TableContext);
    return <th ref={ref} scope="row" className={cn(tableCellVariants({ density: propDensity ?? density }), "text-start font-normal", className)} {...props} />;
  },
);
TableRowHeader.displayName = "TableRowHeader";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-3 text-xs text-[var(--ds-muted-fg)]", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableRowHeader,
  TableEmptyCell,
  TableCaption,
};
