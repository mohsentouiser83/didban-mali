"use client";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "./dropdown-menu";
import { Button } from "./button";
import { Tooltip } from "./tooltip";
import {
  CornersOutIcon,
  CornersInIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
  FileXlsIcon,
  FilePdfIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface TableToolbarProps {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onExportExcel: () => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
  onOpenImport?: () => void;
  toolbarVariant?: "primary" | "secondary" | "soft" | "crimson";
}

export function TableToolbar({
  isFullscreen,
  onToggleFullscreen,
  onExportExcel,
  onExportCsv,
  onExportPdf,
  onOpenImport,
  toolbarVariant = "primary",
}: TableToolbarProps) {
  // Button styling harmonized with the Didban Mali design system (primary token #5556DE)
  const actionButtonClass = cn(
    "relative size-11 sm:size-9 shrink-0 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-safe:active:scale-95 motion-reduce:transition-none shadow-action",
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
    <div className="flex flex-wrap items-center justify-end gap-3 p-3 bg-surface border-b border-border/70 rounded-t-control">
      <div className="flex items-center gap-1.5">
        {/* 1. Fullscreen Button */}
        <Tooltip content={isFullscreen ? "خروج از تمام صفحه (Esc)" : "نمایش تمام صفحه جدول"}>
          <Button
            variant="menu"
            onClick={onToggleFullscreen}
            className={actionButtonClass}
            aria-label={isFullscreen ? "خروج از تمام صفحه" : "نمایش تمام صفحه"}
          >
            {isFullscreen ? (
              <CornersInIcon size={18} weight="bold" />
            ) : (
              <CornersOutIcon size={18} weight="bold" />
            )}
          </Button>
        </Tooltip>

        {/* 2. Download / Export Button */}
        <DropdownMenu>
          <Tooltip content="دانلود خروجی (اکسل / PDF)">
            <DropdownMenuTrigger asChild>
              <Button
                variant="menu"
                className={actionButtonClass}
                aria-label="دانلود خروجی اکسل و PDF"
              >
                <DownloadSimpleIcon size={18} weight="bold" />
              </Button>
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
          <Tooltip content="ورود اطلاعات از اکسل">
            <Button
              variant="menu"
              onClick={onOpenImport}
              className={actionButtonClass}
              aria-label="ورود اطلاعات از اکسل"
            >
              <UploadSimpleIcon size={18} weight="bold" />
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
