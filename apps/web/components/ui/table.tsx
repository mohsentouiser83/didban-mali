"use client";

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./content-states";
import { TableToolbar } from "./table-toolbar";
import { TableImportDialog, type ParsedTableImport } from "./table-import-dialog";
export { type ParsedTableImport } from "./table-import-dialog";
import { TableFilterPopover, type TableFilterPopoverProps } from "./table-filter-popover";
import { columnFilterOptions, matchesColumnFilter, type ColumnFilterConfig } from "./table-column-filter";
import {
  exportTableToExcel,
  exportTableToCsv,
  exportTableToPdf,
  parseNumericCell,
} from "./table-export";
import {
  PushPinIcon,
  ArrowsDownUpIcon,
  CaretUpIcon,
  CaretDownIcon,
  CornersInIcon,
} from "@phosphor-icons/react";
import { Tooltip } from "./tooltip";

// Context to track if a row is inside TableHeader
const TableHeaderContext = createContext<boolean>(false);

export interface TableContextType {
  stickyFirstColumn?: boolean;
  interactive?: boolean;
  toolbar?: boolean;
  columnControls?: boolean;
  title?: string;
  sortColumn: number | null;
  sortDirection: "asc" | "desc" | null;
  toggleSort: (columnIndex: number) => void;
  pinnedColumns: number[];
  togglePin: (columnIndex: number) => void;
  columnFilters: Record<number, ColumnFilterConfig>;
  setColumnFilter: (columnIndex: number, filter: ColumnFilterConfig | null) => void;
  getColumnUniqueValues: (columnIndex: number) => { value: string; count: number }[];
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  exportExcel: () => void;
  exportCsv: () => void;
  exportPdf: () => void;
  openImport?: () => void;
}

export const TableContext = createContext<Partial<TableContextType>>({});

export interface TableProps extends ComponentProps<"table"> {
  stickyFirstColumn?: boolean;
  toolbar?: boolean;
  columnControls?: boolean;
  title?: string;
  toolbarVariant?: "primary" | "secondary" | "soft" | "crimson";
  onImport?: (data: ParsedTableImport) => void | Promise<void>;
  importPersistsSource?: boolean;
}

export function Table({
  className,
  stickyFirstColumn = false,
  toolbar = true,

  columnControls = true,
  title,
  toolbarVariant = "primary",
  onImport,
  importPersistsSource = false,
  children,
  ...props
}: TableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(null);
  const [pinnedColumns, setPinnedColumns] = useState<number[]>([]);
  const [columnFilters, setColumnFilters] = useState<Record<number, ColumnFilterConfig>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Extract cell text for a row at a column index
  const getCellText = (tr: HTMLTableRowElement, colIdx: number): string => {
    const cells = Array.from(tr.querySelectorAll<HTMLTableCellElement>(":scope > td, :scope > th"));
    return cells[colIdx]?.textContent?.trim() || "";
  };

  // Get distinct values in a column with frequency counts
  const getColumnUniqueValues = useCallback((colIdx: number) => {
    if (!tableRef.current) return [];
    const tbody = tableRef.current.querySelector("tbody");
    if (!tbody) return [];

    const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>(":scope > tr")).filter(
      (tr) =>
        !tr.hasAttribute("data-empty-row") &&
        !tr.hasAttribute("data-filter-empty-row") &&
        !tr.querySelector("[colspan]")
    );

    return columnFilterOptions(rows, (row) => getCellText(row, colIdx));
  }, []);

  // Column filter execution
  const applyColumnFilters = useCallback(() => {
    if (!columnControls || !tableRef.current) return;
    const tbody = tableRef.current.querySelector("tbody");
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>(":scope > tr")).filter(
      (tr) =>
        !tr.hasAttribute("data-empty-row") &&
        !tr.hasAttribute("data-filter-empty-row") &&
        !tr.querySelector("[colspan]")
    );

    // Attach original index for sorting reset
    rows.forEach((tr, idx) => {
      if (!tr.hasAttribute("data-original-index")) {
        tr.setAttribute("data-original-index", String(idx));
      }
    });

    let count = 0;
    rows.forEach((tr) => {
      const visible = Object.entries(columnFilters).every(([index, filter]) =>
        matchesColumnFilter(getCellText(tr, Number(index)), filter)
      );
      tr.style.display = visible ? "" : "none";
      if (visible) count++;
    });


    // Empty filter indicator
    let emptyRow = tbody.querySelector<HTMLTableRowElement>("tr[data-filter-empty-row]");
    if (count === 0 && rows.length > 0) {
      if (!emptyRow) {
        emptyRow = document.createElement("tr");
        emptyRow.setAttribute("data-filter-empty-row", "true");
        const thCount = tableRef.current.querySelectorAll("thead th").length || 1;
        const cell = emptyRow.insertCell();
        cell.colSpan = thCount;
        cell.className = "py-12 text-center text-sm text-muted";
        cell.textContent = "ردیفی با این فیلترها پیدا نشد";
        tbody.appendChild(emptyRow);
      } else {
        emptyRow.style.display = "";
      }
    } else if (emptyRow) {
      emptyRow.style.display = "none";
    }
  }, [columnControls, columnFilters]);

  // Sort execution
  const applySort = useCallback((colIdx: number | null, dir: "asc" | "desc" | null) => {
    if (!tableRef.current) return;
    const tbody = tableRef.current.querySelector("tbody");
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>(":scope > tr")).filter(
      (tr) =>
        !tr.hasAttribute("data-empty-row") &&
        !tr.hasAttribute("data-filter-empty-row") &&
        !tr.querySelector("[colspan]")
    );

    if (dir === null || colIdx === null) {
      rows.sort((a, b) => {
        const idxA = Number(a.getAttribute("data-original-index") || 0);
        const idxB = Number(b.getAttribute("data-original-index") || 0);
        return idxA - idxB;
      });
    } else {
      rows.sort((a, b) => {
        const textA = getCellText(a, colIdx);
        const textB = getCellText(b, colIdx);
        const numA = parseNumericCell(textA);
        const numB = parseNumericCell(textB);

        if (numA !== null && numB !== null) {
          return dir === "asc" ? numA - numB : numB - numA;
        }
        const cmp = textA.localeCompare(textB, "fa", { numeric: true });
        return dir === "asc" ? cmp : -cmp;
      });
    }

    rows.forEach((tr) => tbody.appendChild(tr));
  }, []);

  // Pinning execution (applies sticky start-X classes and inline offsets)
  const applyPinned = useCallback((pinned: number[]) => {
    if (!tableRef.current) return;
    const ths = Array.from(tableRef.current.querySelectorAll<HTMLTableCellElement>("thead th"));
    const trs = Array.from(tableRef.current.querySelectorAll<HTMLTableRowElement>("tbody tr"));

    ths.forEach((th) => {
      if (!th.hasAttribute("data-static-sticky")) {
        th.classList.remove("sticky", "z-20", "bg-surface", "shadow-[1px_0_0_0_hsl(var(--border))]");
        th.style.insetInlineStart = "";
      }
    });

    trs.forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll<HTMLTableCellElement>(":scope > td, :scope > th"));
      cells.forEach((td) => {
        if (!td.hasAttribute("data-static-sticky")) {
          td.classList.remove("sticky", "z-10", "bg-surface", "shadow-[1px_0_0_0_hsl(var(--border))]");
          td.style.insetInlineStart = "";
        }
      });
    });

    let cumulativeStart = 0;
    pinned.forEach((colIdx) => {
      const th = ths[colIdx];
      if (th) {
        th.classList.add("sticky", "z-20", "bg-surface", "shadow-[1px_0_0_0_hsl(var(--border))]");
        th.style.insetInlineStart = `${cumulativeStart}px`;
      }
      trs.forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll<HTMLTableCellElement>(":scope > td, :scope > th"));
        const td = cells[colIdx];
        if (td) {
          td.classList.add("sticky", "z-10", "bg-surface", "shadow-[1px_0_0_0_hsl(var(--border))]");
          td.style.insetInlineStart = `${cumulativeStart}px`;
        }
      });
      if (th) {
        cumulativeStart += th.offsetWidth || 120;
      }
    });
  }, []);

  // Re-apply filters and sort whenever state or children mutate
  useEffect(() => {
    applyColumnFilters();
  }, [applyColumnFilters, children]);

  useEffect(() => {
    applySort(sortColumn, sortDirection);
  }, [sortColumn, sortDirection, applySort, children]);

  useEffect(() => {
    applyPinned(pinnedColumns);
  }, [pinnedColumns, applyPinned, children]);

  // Escape key handler for fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  const toggleSort = useCallback((columnIndex: number) => {
    setSortColumn((currentCol) => {
      if (currentCol !== columnIndex) {
        setSortDirection("asc");
        return columnIndex;
      }
      setSortDirection((currentDir) => {
        if (currentDir === "asc") return "desc";
        if (currentDir === "desc") {
          setSortColumn(null);
          return null;
        }
        return "asc";
      });
      return columnIndex;
    });
  }, []);

  const togglePin = useCallback((columnIndex: number) => {
    setPinnedColumns((prev) => {
      if (prev.includes(columnIndex)) {
        return prev.filter((i) => i !== columnIndex);
      }
      return [...prev, columnIndex];
    });
  }, []);

  const setColumnFilter = useCallback(
    (columnIndex: number, filter: ColumnFilterConfig | null) => {
      setColumnFilters((prev) => {
        const next = { ...prev };
        if (!filter) {
          delete next[columnIndex];
        } else {
          next[columnIndex] = filter;
        }
        return next;
      });
    },
    []
  );

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const handleExportExcel = useCallback(() => {
    if (!tableRef.current) return;
    exportTableToExcel(tableRef.current, { title });
  }, [title]);

  const handleExportCsv = useCallback(() => {
    if (!tableRef.current) return;
    exportTableToCsv(tableRef.current, { title });
  }, [title]);

  const handleExportPdf = useCallback(() => {
    if (!tableRef.current) return;
    exportTableToPdf(tableRef.current, { title });
  }, [title]);

  const handleOpenImport = useCallback(() => {
    setImportDialogOpen(true);
  }, []);

  const contextValue: TableContextType = {
    stickyFirstColumn,
    toolbar,
    columnControls,
    title,

    sortColumn,
    sortDirection,
    toggleSort,
    pinnedColumns,
    togglePin,
    columnFilters,
    setColumnFilter,
    getColumnUniqueValues,
    isFullscreen,
    toggleFullscreen,
    exportExcel: handleExportExcel,
    exportCsv: handleExportCsv,
    exportPdf: handleExportPdf,
    openImport: onImport ? handleOpenImport : undefined,

  };

  return (
    <TableContext.Provider value={contextValue}>
      <div
        ref={containerRef}
        className={cn(
          "min-w-0 w-full max-w-full [contain:layout] focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2",
          isFullscreen
            ? "fixed inset-0 z-50 flex flex-col bg-surface p-6 shadow-2xl overflow-hidden"
            : "rounded-control border border-border bg-surface"
        )}
      >
        {/* Fullscreen top header banner */}
        {isFullscreen && (
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-border">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-bold text-foreground">
                {title || "نمایش تمام صفحه جدول اطلاعات"}
              </h3>

            </div>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted hover:text-foreground hover:bg-canvas transition-colors border border-border"
            >
              <CornersInIcon size={16} />
              خروج از تمام صفحه (Esc)
            </button>
          </div>
        )}

        {/* Table actions */}
        {toolbar && (
          <TableToolbar


            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onExportExcel={handleExportExcel}
            onExportCsv={handleExportCsv}
            onExportPdf={handleExportPdf}
            onOpenImport={onImport ? handleOpenImport : undefined}


            toolbarVariant={toolbarVariant}
          />
        )}

        {/* Scrollable Table Viewport */}
        <div
          className={cn(
            "@container/table min-w-0 w-full max-w-full overflow-x-auto overscroll-x-contain",
            isFullscreen && "flex-1 overflow-y-auto"
          )}
          tabIndex={0}
          role="region"
          aria-label={title || "جدول اطلاعات"}
        >
          <table
            ref={tableRef}
            {...props}
            className={cn(
              "w-full border-collapse text-start text-sm has-[tbody_td:not([colspan])]:min-w-[640px]",
              stickyFirstColumn &&
                "[&_thead_th:first-child]:sticky [&_thead_th:first-child]:start-0 [&_thead_th:first-child]:z-10 [&_thead_th:first-child]:bg-surface [&_thead_th:first-child]:shadow-[1px_0_0_0_hsl(var(--border))] [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:start-0 [&_tbody_td:first-child]:z-10 [&_tbody_td:first-child]:bg-surface [&_tbody_td:first-child]:shadow-[1px_0_0_0_hsl(var(--border))] [&_tbody_th:first-child]:sticky [&_tbody_th:first-child]:start-0 [&_tbody_th:first-child]:z-10 [&_tbody_th:first-child]:bg-surface [&_tbody_th:first-child]:shadow-[1px_0_0_0_hsl(var(--border))]",
              className
            )}
          >
            {children}
          </table>
        </div>

        {onImport && (
          <TableImportDialog
            open={importDialogOpen}
            onOpenChange={setImportDialogOpen}
            onImport={onImport}
            archiveOriginal={!importPersistsSource}
            title={`ورود اطلاعات به ${title || "جدول"}`}
          />
        )}
      </div>
    </TableContext.Provider>
  );
}

export interface TableHeaderProps extends ComponentProps<"thead"> {
  sticky?: boolean;
}

export function TableHeader({ sticky = false, className, children, ...props }: TableHeaderProps) {
  return (
    <TableHeaderContext.Provider value={true}>
      <thead
        {...props}
        className={cn(
          "bg-canvas text-muted",
          sticky && "sticky top-0 z-20 bg-canvas/95 backdrop-blur-xs shadow-xs",
          className
        )}
      >
        {children}
      </thead>
    </TableHeaderContext.Provider>
  );
}

export function TableBody(props: ComponentProps<"tbody">) {
  return (
    <tbody
      {...props}
      className={cn(
        "divide-y divide-border bg-surface motion-safe:animate-fade-in",
        props.className
      )}
    />
  );
}

export function TableRow({ className, children, ...props }: ComponentProps<"tr">) {
  const isHeaderRow = useContext(TableHeaderContext);

  // If in header, map children and assign columnIndex to each TableHead automatically
  if (isHeaderRow) {
    let columnIndex = 0;
    const mappedChildren: ReactNode[] = [];
    for (const child of Children.toArray(children)) {
      if (isValidElement<TableHeadProps>(child)) {
        mappedChildren.push(child.type === TableHead
          ? cloneElement(child, { columnIndex: child.props.columnIndex ?? columnIndex })
          : child);
        columnIndex += child.props.colSpan ?? 1;
      } else {
        mappedChildren.push(child);
      }
    }

    return (
      <tr
        {...props}
        className={cn("divide-x divide-x-reverse divide-border/60", className)}
      >
        {mappedChildren}
      </tr>
    );
  }

  return (
    <tr
      {...props}
      className={cn(
        "transition-colors duration-200 ease-interface hover:bg-primary-soft/30 has-[:focus-visible]:bg-primary-soft/30 motion-reduce:transition-none",
        className
      )}
    >
      {children}
    </tr>
  );
}

export interface TableHeadProps extends Omit<ComponentProps<"th">, "align"> {
  stickyFirstColumn?: boolean;
  numeric?: boolean;
  align?: "start" | "center" | "end";
  columnIndex?: number;
  sortable?: boolean;
  pinnable?: boolean;
  filterable?: boolean;
  columnControl?: ReactNode;
  columnFilter?: Omit<TableFilterPopoverProps, "columnTitle"> & { columnTitle?: string };
}

export function TableHead({
  stickyFirstColumn,
  numeric,
  align,
  columnIndex,
  sortable,
  pinnable,
  filterable,
  columnControl,
  columnFilter,
  className,
  children,
  ...props
}: TableHeadProps) {
  const tableCtx = useContext(TableContext);
  const headRef = useRef<HTMLTableCellElement>(null);

  // Resolved column index (injected automatically by TableRow or explicitly passed)
  const resolvedIndex = columnIndex ?? 0;

  // Extract label text from children (including nested sr-only spans)
  const columnTitle = useMemo(() => {
    const extract = (node: ReactNode): string => {
      if (typeof node === "string") return node;
      if (typeof node === "number") return String(node);
      if (Array.isArray(node)) return node.map(extract).join(" ");
      if (node && typeof node === "object" && "props" in node) {
        const el = node as { props?: { children?: ReactNode } };
        return extract(el.props?.children);
      }
      return "";
    };
    return extract(children).replace(/\s+/g, " ").trim();
  }, [children]);

  // Detect operations/actions column: disable sort, pin, and filter
  const isOperations = useMemo(() => {
    const text = columnTitle.toLowerCase();
    return (
      text === "عملیات" ||
      text === "اقدام" ||
      text === "انتخاب" ||
      text === "actions" ||
      text === "عملیات‌ها" ||
      text === "action"
    );
  }, [columnTitle]);

  const canSort = sortable !== undefined ? sortable : !isOperations;
  const canPin = pinnable !== undefined ? pinnable : !isOperations;
  const canFilter = !columnControl && !columnFilter && (filterable ?? (!isOperations && !!columnTitle && (props.colSpan ?? 1) === 1));

  const alignment = align ? `text-${align}` : numeric ? "text-end" : "text-start";
  const hasControls = Boolean(
    tableCtx.columnControls && (canSort || canPin || canFilter)
  );

  const isSorted = tableCtx.sortColumn === resolvedIndex;
  const sortDir = isSorted ? tableCtx.sortDirection : null;
  const isPinned = Boolean(tableCtx.pinnedColumns?.includes(resolvedIndex));
  const activeFilter = tableCtx.columnFilters?.[resolvedIndex];
  const isFiltered = Boolean(
    activeFilter &&
      (activeFilter.selectedValues ||
        activeFilter.textCondition)
  );


  return (
    <th
      ref={headRef}
      {...props}
      scope="col"
      data-column-title={columnTitle}
      data-static-sticky={stickyFirstColumn ? "true" : undefined}
      className={cn(
        "whitespace-nowrap px-3.5 py-3 font-medium text-xs border-e border-border/50 last:border-e-0",
        alignment,
        stickyFirstColumn &&
          "sticky start-0 z-10 bg-surface shadow-[1px_0_0_0_hsl(var(--border))]",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 min-w-0 select-none",
          numeric || align === "end" ? "justify-end" : "justify-between"
        )}
      >
        <span className="truncate table-head-title font-medium text-foreground">
          {children}
        </span>

        {columnControl}
        {columnFilter && <TableFilterPopover {...columnFilter} columnTitle={columnFilter.columnTitle ?? columnTitle} />}
        {hasControls && (
          <div
            className="flex items-center gap-0.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 1. Sort Button (⇅) */}
            {canSort && (
              <Tooltip
                content={
                  sortDir === "asc"
                    ? "مرتب‌سازی نزولی"
                    : sortDir === "desc"
                    ? "حذف مرتب‌سازی"
                    : "مرتب‌سازی صعودی"
                }
              >
                <button
                  type="button"
                  onClick={() => tableCtx.toggleSort?.(resolvedIndex)}
                  className={cn(
                    "size-6 rounded flex items-center justify-center transition-colors cursor-pointer",
                    isSorted
                      ? "text-primary bg-primary-soft/80 font-bold"
                      : "text-muted/70 hover:text-foreground hover:bg-black/5"
                  )}
                  aria-label="مرتب‌سازی ستون"
                >
                  {sortDir === "asc" ? (
                    <CaretUpIcon size={14} weight="bold" />
                  ) : sortDir === "desc" ? (
                    <CaretDownIcon size={14} weight="bold" />
                  ) : (
                    <ArrowsDownUpIcon size={14} />
                  )}
                </button>
              </Tooltip>
            )}

            {/* 2. Pin Button (📌) */}
            {canPin && (
              <Tooltip content={isPinned ? "حذف پین این ستون" : "ثابت کردن ستون (Pin)"}>
                <button
                  type="button"
                  onClick={() => tableCtx.togglePin?.(resolvedIndex)}
                  className={cn(
                    "size-6 rounded flex items-center justify-center transition-colors cursor-pointer",
                    isPinned
                      ? "text-primary bg-primary-soft/80 font-bold"
                      : "text-muted/70 hover:text-primary hover:bg-black/5"
                  )}
                  aria-label="پین ستون"
                >
                  <PushPinIcon size={14} weight={isPinned ? "fill" : "regular"} />
                </button>
              </Tooltip>
            )}

            {/* 3. Filter Button (▽) */}
            {canFilter && (
              <TableFilterPopover
                columnTitle={columnTitle || `ستون ${resolvedIndex + 1}`}
                getValues={() => tableCtx.getColumnUniqueValues?.(resolvedIndex) ?? []}
                activeFilter={activeFilter}
                onApply={(filter) => tableCtx.setColumnFilter?.(resolvedIndex, filter)}
                isActive={isFiltered}
              />
            )}
          </div>
        )}
      </div>
    </th>
  );
}

export interface TableCellProps extends Omit<ComponentProps<"td">, "align"> {
  stickyFirstColumn?: boolean;
  numeric?: boolean;
  align?: "start" | "center" | "end";
}

export function TableCell({
  stickyFirstColumn,
  numeric,
  align,
  className,
  ...props
}: TableCellProps) {
  const alignment = align ? `text-${align}` : numeric ? "text-end font-mono" : "text-start";
  return (
    <td
      {...props}
      data-static-sticky={stickyFirstColumn ? "true" : undefined}
      className={cn(
        "px-4 py-3.5 tabular-nums text-sm",
        alignment,
        stickyFirstColumn &&
          "sticky start-0 z-10 bg-surface shadow-[1px_0_0_0_hsl(var(--border))]",
        className
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
      data-static-sticky={stickyFirstColumn ? "true" : undefined}
      className={cn(
        "px-4 py-4 text-start font-normal",
        stickyFirstColumn &&
          "sticky start-0 z-10 bg-surface shadow-[1px_0_0_0_hsl(var(--border))]",
        className
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
  action?: ReactNode;
}) {
  return (
    <tr data-empty-row="true">
      <td colSpan={colSpan}>
        <div className="sticky start-0 w-[100cqw] max-w-full">
          <EmptyState title={title} action={action} />
        </div>
      </td>
    </tr>
  );
}

/**
 * High-level typed DataTable component for rendering data directly from arrays.
 */
export interface DataTableColumn<T> {
  key: keyof T & string | string;
  header: string;
  numeric?: boolean;
  align?: "start" | "center" | "end";
  sortable?: boolean;
  pinnable?: boolean;
  filterable?: boolean;
  render?: (row: T, index: number) => ReactNode;
}

export function DataTable<T extends object>({
  columns,
  data,
  title,
  toolbar = true,
  toolbarVariant = "primary",
  onImport,
  emptyTitle = "هنوز داده‌ای ثبت نشده",
  emptyAction,
  className,
}: {
  columns: DataTableColumn<T>[];
  data: T[];
  title?: string;
  toolbar?: boolean;
  toolbarVariant?: "primary" | "secondary" | "soft" | "crimson";
  onImport?: (parsed: ParsedTableImport) => void | Promise<void>;
  emptyTitle?: string;
  emptyAction?: ReactNode;
  className?: string;
}) {
  return (
    <Table
      title={title}
      toolbar={toolbar}
      toolbarVariant={toolbarVariant}
      onImport={onImport}
      className={className}
    >
      <TableHeader>
        <TableRow>
          {columns.map((col, idx) => (
            <TableHead
              key={String(col.key) || idx}
              columnIndex={idx}
              numeric={col.numeric}
              align={col.align}
              sortable={col.sortable}
              pinnable={col.pinnable}
              filterable={col.filterable}
            >
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length ? (
          data.map((row, rIdx) => (
            <TableRow key={((row as Record<string, unknown>).id as string | number) ?? rIdx}>
              {columns.map((col) => (
                <TableCell
                  key={String(col.key)}
                  numeric={col.numeric}
                  align={col.align}
                >
                  {col.render
                    ? col.render(row, rIdx)
                    : String((row as Record<string, unknown>)[col.key] ?? "—")}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableEmptyCell colSpan={columns.length} title={emptyTitle} action={emptyAction} />
        )}
      </TableBody>
    </Table>
  );
}
