"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

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
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, containerClassName, density = "normal", ...props }, ref) => {
    const normalizedDensity = density === "default" ? "normal" : density;

    return (
      <TableContext.Provider value={{ density: normalizedDensity }}>
        <div className={cn("relative w-full overflow-x-auto rounded-xl border border-[var(--ds-border)] bg-[var(--ds-card)] shadow-sm", containerClassName)}>
          <table
            ref={ref}
            className={cn("w-full min-w-[720px] border-collapse text-start", className)}
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
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
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
  selected?: boolean;
  risk?: "critical" | "high" | "medium" | "low";
}

const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, selected, risk, ...props }, ref) => (
    <tr
      ref={ref}
      aria-selected={selected ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      data-risk={risk}
      className={cn(
        "border-b border-[var(--ds-border)] transition-colors duration-150 hover:bg-[var(--ds-table-hover)]",
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
        true: "text-left font-mono font-bold ds-persian-numerals [font-feature-settings:'tnum']",
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
  TableCaption,
};
