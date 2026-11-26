"use client";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "./dropdown-menu";
import { Tooltip } from "./tooltip";
import {
  MagnifyingGlassIcon,
  XIcon,
  CornersOutIcon,
  CornersInIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
  FileXlsIcon,
  FilePdfIcon,
} from "@phosphor-icons/react";
import { cn, persian } from "@/lib/utils";

export interface TableToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  visibleCount: number;
  totalCount: number;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onExportExcel: () => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
  onOpenImport?: () => void;
  hasActiveFilters: boolean;
  showSearch?: boolean;
  toolbarVariant?: "primary" | "secondary" | "soft" | "crimson";
}

export function TableToolbar({
  searchTerm,
  onSearchChange,
  visibleCount,
  totalCount,
  isFullscreen,
  onToggleFullscreen,
  onExportExcel,
  onExportCsv,
  onExportPdf,
  onOpenImport,
  hasActiveFilters,
  showSearch = true,
  toolbarVariant = "primary",
}: TableToolbarProps) {
  // Button styling harmonized with the Didban Mali design system (primary token #5556DE)
  const actionButtonClass = cn(
    "relative size-9 shrink-0 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-safe:active:scale-95 motion-reduce:transition-none shadow-action",
    {
      "bg-primary hover:bg-primary-hover text-white hover:shadow-md hover:shadow-primary/20":
        toolbarVariant === "primary",
      "border border-border bg-surface text-foreground hover:bg-primary-soft hover:text-primary hover:border-primary/40":
        toolbarVariant === "secondary",
      "bg-primary-soft text-primary hover:bg-primary/20":
        toolbarVariant === "soft",
      "bg-danger hover:bg-danger/90 text-white focus-visible:ring-danger":
        toolbarVariant === "crimson",
    }
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface border-b border-border/70 rounded-t-control">
      {/* Search Input on the right (in RTL) */}
      {showSearch ? (
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="جست‌وجو در جدول"
            className="w-full h-9 rounded-xl border border-border/80 bg-canvas/40 ps-4 pe-10 text-xs text-foreground placeholder:text-muted transition-all focus:border-primary/60 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/15"
            aria-label="جست‌وجو در جدول"
          />
          <div className="absolute end-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-muted pointer-events-none">
            {searchTerm && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="pointer-events-auto p-0.5 text-muted hover:text-foreground transition-colors"
                aria-label="پاک‌کردن جستجو"
              >
                <XIcon size={14} />
              </button>
            )}
            <MagnifyingGlassIcon size={16} />
          </div>
        </div>
      ) : (
        <div />
      )}

      {/* Action Buttons Toolbar on the left (in RTL) */}
      <div className="flex items-center gap-1.5">
        {/* Row count summary badge if filtered or searched */}
        {hasActiveFilters && totalCount > 0 && (
          <span className="me-2 text-[11px] font-medium text-muted bg-canvas px-2.5 py-1 rounded-lg border border-border/60">
            نمایش {persian(visibleCount)} از {persian(totalCount)} ردیف
          </span>
        )}

        {/* 1. Fullscreen Button */}
        <Tooltip content={isFullscreen ? "خروج از تمام صفحه (Esc)" : "نمایش تمام صفحه جدول"}>
          <button
            type="button"
            onClick={onToggleFullscreen}
            className={actionButtonClass}
            aria-label={isFullscreen ? "خروج از تمام صفحه" : "نمایش تمام صفحه"}
          >
            {isFullscreen ? (
              <CornersInIcon size={18} weight="bold" />
            ) : (
              <CornersOutIcon size={18} weight="bold" />
            )}
          </button>
        </Tooltip>

        {/* 2. Download / Export Button */}
        <DropdownMenu>
          <Tooltip content="دانلود خروجی (اکسل / PDF)">
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={actionButtonClass}
                aria-label="دانلود خروجی اکسل و PDF"
              >
                <DownloadSimpleIcon size={18} weight="bold" />
              </button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-56 p-1.5 text-xs">
            <DropdownMenuLabel>دانلود خروجی جدول</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={onExportExcel}
              className="gap-2.5 text-xs cursor-pointer py-2"
            >
              <FileXlsIcon size={18} className="text-emerald" weight="fill" />
              <span>خروجی اکسل (Excel / XLSX)</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onExportCsv}
              className="gap-2.5 text-xs cursor-pointer py-2"
            >
              <DownloadSimpleIcon size={18} className="text-primary" weight="bold" />
              <span>خروجی استاندارد CSV (فارسی)</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onExportPdf}
              className="gap-2.5 text-xs cursor-pointer py-2"
            >
              <FilePdfIcon size={18} className="text-danger" weight="fill" />
              <span>خروجی PDF (چاپ و ذخیره)</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {onOpenImport && (
          <Tooltip content="ورود اطلاعات از اکسل (Import Excel)">
            <button
              type="button"
              onClick={onOpenImport}
              className={actionButtonClass}
              aria-label="ورود اطلاعات از اکسل"
            >
              <UploadSimpleIcon size={18} weight="bold" />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
