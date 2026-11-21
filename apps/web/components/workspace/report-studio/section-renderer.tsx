"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  BASIS_OPTIONS,
  type RenderedSection,
  type StudioBasisType,
  type StudioLayoutType,
  type StudioWidgetSpec,
} from "@/lib/report-studio";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsLeftRightIcon,
  DatabaseIcon,
  DotsSixVerticalIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { WidgetRenderer } from "./widget-renderer";

interface SectionRendererProps {
  section: RenderedSection;
  index?: number;
  totalSections?: number;
  onUpdateLayout?: (layout: StudioLayoutType) => void;
  onUpdateBasis?: (basis: StudioBasisType) => void;
  onReorder?: (targetIndex: number) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDeleteSection?: () => void;
  onAddWidget?: () => void;
  onEditWidget?: (widget: StudioWidgetSpec) => void;
  onDeleteWidget?: (widgetId: string) => void;
  readOnly?: boolean;
}

const LAYOUT_BUTTONS: { value: StudioLayoutType; label: string; cols: string }[] = [
  { value: "grid-1", label: "۱ ستون", cols: "۱۰۰٪" },
  { value: "grid-2", label: "۲ ستون", cols: "۵۰/۵۰" },
  { value: "grid-3", label: "۳ ستون", cols: "۳۳٪" },
  { value: "grid-4", label: "۴ ستون", cols: "۲۵٪" },
  { value: "split-2-1", label: "۲/۳ + ۱/۳", cols: "۶۶/۳۳" },
  { value: "split-1-2", label: "۱/۳ + ۲/۳", cols: "۳۳/۶۶" },
];

export function SectionRenderer({
  section,
  index = 0,
  totalSections = 1,
  onUpdateLayout,
  onUpdateBasis,
  onReorder,
  onMoveUp,
  onMoveDown,
  onDeleteSection,
  onAddWidget,
  onEditWidget,
  onDeleteWidget,
  readOnly = false,
}: SectionRendererProps) {
  const { title, description, layout, basis = "all", widgets } = section;

  // Animation states
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [previewLayout, setPreviewLayout] = useState<StudioLayoutType | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const activeLayout = previewLayout || layout;

  // Animated delete
  const handleDelete = () => {
    if (!onDeleteSection) return;
    setIsDeleting(true);
    setTimeout(() => {
      onDeleteSection();
    }, 280);
  };

  // Mouse horizontal drag resizing on section edge
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (readOnly || !onUpdateLayout) return;
    e.preventDefault();
    e.stopPropagation();

    setIsResizing(true);
    const startX = e.clientX;
    const initialWidth = containerRef.current?.getBoundingClientRect().width || 800;

    const onMouseMove = (moveEvent: MouseEvent) => {
      // In RTL layout, dragging towards left increases relative width
      const deltaX = startX - moveEvent.clientX;
      const ratio = Math.max(0.1, Math.min(1.2, 0.5 + deltaX / initialWidth));

      let next: StudioLayoutType = "grid-2";
      if (ratio < 0.35) next = "grid-1";
      else if (ratio < 0.6) next = "grid-2";
      else if (ratio < 0.85) next = "grid-3";
      else next = "grid-4";

      setPreviewLayout(next);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setIsResizing(false);
      setPreviewLayout((finalLayout) => {
        if (finalLayout && finalLayout !== layout) {
          onUpdateLayout(finalLayout);
        }
        return null;
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Drag and Drop reordering
  const handleDragStart = (e: React.DragEvent) => {
    if (readOnly) return;
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    setIsDraggingOver(false);
    const sourceIndex = Number(e.dataTransfer.getData("text/plain"));
    if (!Number.isNaN(sourceIndex) && sourceIndex !== index && onReorder) {
      onReorder(index);
    }
  };

  // Grid styling based on active layout
  let gridClasses = "grid grid-cols-1 gap-5 transition-all duration-300";
  if (activeLayout === "grid-2") gridClasses = "grid grid-cols-1 md:grid-cols-2 gap-5 transition-all duration-300";
  if (activeLayout === "grid-3") gridClasses = "grid grid-cols-1 md:grid-cols-3 gap-5 transition-all duration-300";
  if (activeLayout === "grid-4") gridClasses = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 transition-all duration-300";
  if (activeLayout === "split-2-1" || activeLayout === "split-1-2") {
    gridClasses = "grid grid-cols-1 lg:grid-cols-3 gap-5 transition-all duration-300";
  }

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group relative rounded-panel border bg-canvas/60 p-5 backdrop-blur-sm transition-all duration-300 ease-interface ${
        isDeleting
          ? "pointer-events-none -translate-y-3 scale-95 border-transparent opacity-0 max-h-0 overflow-hidden py-0 my-0"
          : "scale-100 opacity-100 max-h-[3000px] border-border/80"
      } ${
        isDraggingOver
          ? "border-primary bg-primary-soft/30 ring-2 ring-primary ring-offset-2 scale-[1.01]"
          : "hover:border-border"
      } ${isResizing ? "ring-2 ring-primary/40 shadow-md" : ""}`}
    >
      {/* Visual Live Resize Badge */}
      {isResizing && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-white shadow-lg animate-pulse">
          <ArrowsLeftRightIcon size={14} />
          <span>چیدمان جدید: {LAYOUT_BUTTONS.find((b) => b.value === activeLayout)?.label}</span>
        </div>
      )}

      {/* Mouse Drag-to-Resize Handle on the Left Border */}
      {!readOnly && onUpdateLayout && (
        <div
          role="separator"
          tabIndex={0}
          aria-label="تغییر اندازه ستون‌ها با ماوس"
          onMouseDown={handleResizeMouseDown}
          className={`absolute top-2 bottom-2 left-0.5 z-10 w-3 cursor-ew-resize flex items-center justify-center rounded-l-panel transition-colors ${
            isResizing ? "bg-primary/40 text-primary" : "hover:bg-primary/20 text-muted/60 hover:text-primary"
          }`}
          title="برای تغییر پویای ستون‌ها با ماوس به چپ یا راست بکشید"
        >
          <div className="h-10 w-1 rounded-full bg-border group-hover:bg-primary/80 transition-colors" />
        </div>
      )}

      {/* Section Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        {/* Title and Grip / Reorder Controls */}
        <div className="flex items-center gap-2.5">
          {/* Drag Handle */}
          {!readOnly && onReorder && (
            <div
              draggable
              onDragStart={handleDragStart}
              className="cursor-grab active:cursor-grabbing rounded-control p-1 text-muted hover:bg-surface hover:text-primary transition-colors"
              title="برای جابه‌جایی، این آیکون را با ماوس بگیرید و بکشید"
            >
              <DotsSixVerticalIcon size={20} />
            </div>
          )}

          {/* Quick Order Badge & Selector */}
          {!readOnly && onReorder && totalSections > 1 ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted font-medium">ردیف:</span>
              <Select
                value={String(index + 1)}
                onValueChange={(val) => onReorder(Number(val) - 1)}
                options={Array.from({ length: totalSections }, (_, i) => ({
                  value: String(i + 1),
                  label: `ردیف ${i + 1}`,
                }))}
                className="w-24 text-xs font-medium"
              />
            </div>
          ) : (
            <span className="rounded-control bg-surface px-2 py-0.5 text-xs font-medium text-muted border border-border/60">
              ردیف {index + 1}
            </span>
          )}

          <div>
            <h3 className="font-heading text-base font-medium text-foreground">
              {title || "بخش بدون عنوان"}
            </h3>
            {description && <p className="text-xs text-muted">{description}</p>}
          </div>
        </div>

        {/* Section Actions: Basis Selector, Mouse Layout Resizer, Widgets, Delete */}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Per-Section Extraction Basis Selector */}
            {onUpdateBasis && (
              <div className="flex items-center gap-1">
                <DatabaseIcon size={14} className="text-muted shrink-0" />
                <Select
                  value={basis}
                  onValueChange={(val) => onUpdateBasis(val as StudioBasisType)}
                  options={BASIS_OPTIONS}
                  className="w-40 text-xs"
                />
              </div>
            )}

            {/* 2. Mouse Resizing Layout Switcher (No Select Dropdown!) */}
            {onUpdateLayout && (
              <div className="flex items-center rounded-control border border-border bg-surface p-0.5 shadow-2xs">
                {LAYOUT_BUTTONS.map((btn) => (
                  <button
                    key={btn.value}
                    type="button"
                    onClick={() => onUpdateLayout(btn.value)}
                    className={`rounded-xs px-2 py-1 text-xs transition-all ${
                      activeLayout === btn.value
                        ? "bg-primary text-white font-medium shadow-xs"
                        : "text-muted hover:text-foreground hover:bg-canvas"
                    }`}
                    title={`${btn.label} (${btn.cols})`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            )}

            {/* Move Up / Down 1-step shortcuts */}
            {onMoveUp && (
              <button
                type="button"
                onClick={onMoveUp}
                disabled={index === 0}
                className="rounded-control border border-border p-1.5 text-muted hover:bg-surface hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="انتقال یک ردیف به بالا"
              >
                <ArrowUpIcon size={16} />
              </button>
            )}

            {onMoveDown && (
              <button
                type="button"
                onClick={onMoveDown}
                disabled={index === totalSections - 1}
                className="rounded-control border border-border p-1.5 text-muted hover:bg-surface hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="انتقال یک ردیف به پایین"
              >
                <ArrowDownIcon size={16} />
              </button>
            )}

            {/* Add Widget */}
            {onAddWidget && (
              <Button variant="soft" onClick={onAddWidget} className="gap-1.5 py-1 px-2.5 text-xs">
                <PlusIcon size={16} />
                افزودن ویجت
              </Button>
            )}

            {/* Delete Section with smooth animation */}
            {onDeleteSection && (
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-control border border-border p-1.5 text-muted hover:border-danger/30 hover:bg-danger-soft hover:text-danger transition-colors"
                title="حذف سکشن"
              >
                <TrashIcon size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Widgets Grid */}
      {widgets.length > 0 ? (
        <div className={gridClasses}>
          {widgets.map((widget, idx) => {
            let colSpanClass = "";
            if (activeLayout === "split-2-1" && idx === 0) colSpanClass = "lg:col-span-2";
            if (activeLayout === "split-1-2" && idx === 1) colSpanClass = "lg:col-span-2";

            return (
              <div key={widget.id} className={`${colSpanClass} transition-all duration-300`}>
                <WidgetRenderer
                  widget={widget}
                  readOnly={readOnly}
                  onEdit={onEditWidget ? () => onEditWidget(widget) : undefined}
                  onDelete={onDeleteWidget ? () => onDeleteWidget(widget.id) : undefined}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-control border border-dashed border-border py-12 text-center transition-all">
          <p className="text-sm text-muted">این بخش هنوز هیچ ویجتی ندارد</p>
          {!readOnly && onAddWidget && (
            <Button variant="ghost" onClick={onAddWidget} className="mt-3 gap-1 py-1 px-2.5 text-xs">
              <PlusIcon size={16} />
              افزودن اولین ویجت
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
