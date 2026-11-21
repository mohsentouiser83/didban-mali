"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  BASIS_OPTIONS,
  type RenderedSection,
  type RenderedWidget,
  type StudioBasisType,
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
  onUpdateBasis?: (basis: StudioBasisType) => void;
  onReorder?: (targetIndex: number) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDeleteSection?: () => void;
  onAddWidget?: () => void;
  onEditWidget?: (widget: StudioWidgetSpec) => void;
  onDeleteWidget?: (widgetId: string) => void;
  onResizeWidget?: (widgetId: string, colSpan: number) => void;
  readOnly?: boolean;
}

function getColSpanClass(span: number): string {
  switch (span) {
    case 3:
      return "col-span-12 md:col-span-3";
    case 4:
      return "col-span-12 md:col-span-4";
    case 6:
      return "col-span-12 md:col-span-6";
    case 8:
      return "col-span-12 md:col-span-8";
    case 9:
      return "col-span-12 md:col-span-9";
    case 12:
    default:
      return "col-span-12";
  }
}

function getSpanLabel(span: number): string {
  switch (span) {
    case 3:
      return "۱/۴ ردیف (۲۵٪)";
    case 4:
      return "۱/۳ ردیف (۳۳٪)";
    case 6:
      return "۱/۲ ردیف (۵۰٪)";
    case 8:
      return "۲/۳ ردیف (۶۶٪)";
    case 9:
      return "۳/۴ ردیف (۷۵٪)";
    case 12:
      return "تمام ردیف (۱۰۰٪)";
    default:
      return `${span} ستون از ۱۲`;
  }
}

interface ResizableCardProps {
  widget: RenderedWidget;
  readOnly?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onResize?: (colSpan: number) => void;
}

function ResizableCard({
  widget,
  readOnly,
  onEdit,
  onDelete,
  onResize,
}: ResizableCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewSpan, setPreviewSpan] = useState<number | null>(null);

  const defaultSpan =
    widget.col_span ||
    (widget.type === "kpi_card"
      ? 3
      : widget.type === "data_table" || widget.type === "ai_summary"
      ? 12
      : 6);

  const currentSpan = previewSpan || defaultSpan;

  // Animated delete for this specific card
  const handleDeleteCard = () => {
    if (!onDelete) return;
    setIsDeleting(true);
    setTimeout(() => {
      onDelete();
    }, 260);
  };

  // Mouse drag-to-resize handle for this individual card
  const handleMouseDown = (e: React.MouseEvent) => {
    if (readOnly || !onResize) return;
    e.preventDefault();
    e.stopPropagation();

    setIsResizing(true);
    const startX = e.clientX;
    const cardRect = cardRef.current?.getBoundingClientRect();
    const parentRect = cardRef.current?.parentElement?.getBoundingClientRect();
    const initialWidth = cardRect?.width || 260;
    const containerWidth = parentRect?.width || 1100;

    const onMouseMove = (moveEvent: MouseEvent) => {
      // In RTL layout, dragging to the left increases the card width
      const deltaX = startX - moveEvent.clientX;
      const targetWidth = Math.max(140, initialWidth + deltaX);
      const ratio = targetWidth / containerWidth;

      let nextSpan = 3;
      if (ratio < 0.29) nextSpan = 3;          // 25% (1/4)
      else if (ratio < 0.42) nextSpan = 4;     // 33% (1/3)
      else if (ratio < 0.58) nextSpan = 6;     // 50% (1/2)
      else if (ratio < 0.75) nextSpan = 8;     // 66% (2/3)
      else if (ratio < 0.90) nextSpan = 9;     // 75% (3/4)
      else nextSpan = 12;                      // 100% (full)

      setPreviewSpan(nextSpan);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setIsResizing(false);
      setPreviewSpan((finalSpan) => {
        if (finalSpan && finalSpan !== defaultSpan) {
          onResize(finalSpan);
        }
        return null;
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const cycleSpan = () => {
    if (readOnly || !onResize) return;
    const spans = [3, 4, 6, 8, 12];
    const currentIndex = spans.indexOf(currentSpan);
    const nextSpan = spans[(currentIndex + 1) % spans.length];
    onResize(nextSpan);
  };

  const spanClass = getColSpanClass(currentSpan);

  return (
    <div
      ref={cardRef}
      className={`group relative ${spanClass} transition-all duration-300 ease-interface ${
        isDeleting
          ? "pointer-events-none -translate-y-3 scale-90 opacity-0 max-h-0 overflow-hidden py-0 my-0 border-transparent"
          : "scale-100 opacity-100 animate-[scale-in_240ms_cubic-bezier(0.2,0.7,0.2,1)_both]"
      }`}
    >
      {/* Live Mouse Resizing Indicator Badge */}
      {isResizing && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-white shadow-lg animate-pulse">
          <ArrowsLeftRightIcon size={14} />
          <span>عرض کارت: {getSpanLabel(currentSpan)}</span>
        </div>
      )}

      {/* Mouse Drag-to-Resize Handle on the Left Edge of the Card */}
      {!readOnly && onResize && (
        <div
          role="separator"
          tabIndex={0}
          aria-label="تغییر عرض کارت با ماوس"
          onMouseDown={handleMouseDown}
          className={`absolute top-2 bottom-2 left-0 z-20 w-3 cursor-ew-resize flex items-center justify-center rounded-l-panel transition-all ${
            isResizing
              ? "bg-primary/40 text-primary opacity-100"
              : "opacity-0 group-hover:opacity-100 hover:bg-primary/20 text-muted/60 hover:text-primary"
          }`}
          title="برای تغییر عرض این کارت، با ماوس به چپ یا راست بکشید"
        >
          <div className="h-8 w-1 rounded-full bg-border group-hover:bg-primary transition-colors" />
        </div>
      )}

      {/* Quick Width Pill on Hover (Top-Left) */}
      {!readOnly && onResize && (
        <div className="absolute top-2 left-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={cycleSpan}
            className="rounded-full border border-border/80 bg-surface/90 px-2 py-0.5 text-[10px] font-medium text-muted hover:border-primary hover:text-primary shadow-xs transition-transform active:scale-95"
            title="کلیک برای تغییر مرحله‌ای اندازه کارت (یا کشیدن لبه با ماوس)"
          >
            {getSpanLabel(currentSpan).split(" ")[0]}
          </button>
        </div>
      )}

      {/* The Actual Widget Card with subtle lift animation on hover */}
      <div
        className={`h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-action ${
          isResizing ? "ring-2 ring-primary/50 shadow-md" : ""
        }`}
      >
        <WidgetRenderer
          widget={widget}
          readOnly={readOnly}
          onEdit={onEdit}
          onDelete={onDelete ? handleDeleteCard : undefined}
        />
      </div>
    </div>
  );
}

export function SectionRenderer({
  section,
  index = 0,
  totalSections = 1,
  onUpdateBasis,
  onReorder,
  onMoveUp,
  onMoveDown,
  onDeleteSection,
  onAddWidget,
  onEditWidget,
  onDeleteWidget,
  onResizeWidget,
  readOnly = false,
}: SectionRendererProps) {
  const { title, description, basis = "all", widgets } = section;

  // Animation states
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);

  const prevIndexRef = useRef(index);

  // Trigger brief highlight pulse animation when section moves to a new position
  useEffect(() => {
    if (prevIndexRef.current !== index) {
      prevIndexRef.current = index;
      setHasMoved(true);
      const timer = setTimeout(() => setHasMoved(false), 900);
      return () => clearTimeout(timer);
    }
  }, [index]);

  // Animated delete
  const handleDelete = () => {
    if (!onDeleteSection) return;
    setIsDeleting(true);
    setTimeout(() => {
      onDeleteSection();
    }, 280);
  };

  // Drag and Drop reordering of whole sections
  const handleDragStart = (e: React.DragEvent) => {
    if (readOnly) return;
    setIsDragging(true);
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setIsDraggingOver(false);
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
    setIsDragging(false);
    setIsDraggingOver(false);
    const sourceIndex = Number(e.dataTransfer.getData("text/plain"));
    if (!Number.isNaN(sourceIndex) && sourceIndex !== index && onReorder) {
      onReorder(index);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group relative rounded-panel border bg-canvas/60 p-5 backdrop-blur-sm transition-all duration-300 ease-interface ${
        isDeleting
          ? "pointer-events-none -translate-y-4 scale-95 border-transparent opacity-0 max-h-0 overflow-hidden py-0 my-0"
          : "scale-100 opacity-100 max-h-[4000px] border-border/80 animate-[slide-down_280ms_cubic-bezier(0.2,0.7,0.2,1)_both]"
      } ${
        isDragging
          ? "opacity-40 scale-[0.98] border-dashed border-primary/70 rotate-[-0.5deg] shadow-xs"
          : ""
      } ${
        isDraggingOver
          ? "border-primary bg-primary-soft/40 ring-2 ring-primary ring-offset-4 shadow-action scale-[1.01]"
          : "hover:border-border"
      } ${hasMoved ? "animate-[highlight-pulse_900ms_ease-out_both]" : ""}`}
    >
      {/* Section Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        {/* Title, Grip Drag Handle, and Direct Order Selector */}
        <div className="flex items-center gap-2.5">
          {/* Section Drag Handle */}
          {!readOnly && onReorder && (
            <div
              draggable
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              className="cursor-grab active:cursor-grabbing rounded-control p-1 text-muted hover:bg-surface hover:text-primary active:scale-95 transition-all"
              title="برای جابه‌جایی کل سکشن، این آیکون را با ماوس بگیرید و بکشید"
            >
              <DotsSixVerticalIcon size={20} />
            </div>
          )}

          {/* Quick Order Badge & Selector (e.g. ردیف ۱، ردیف ۲) */}
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

        {/* Section Actions: Per-Section Basis Selector, Up/Down, Add Widget, Delete */}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Per-Section Extraction Basis Selector */}
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

            {/* Move Up / Down 1-step shortcuts with click bounce animation */}
            {onMoveUp && (
              <button
                type="button"
                onClick={onMoveUp}
                disabled={index === 0}
                className="rounded-control border border-border p-1.5 text-muted hover:bg-surface hover:text-foreground active:scale-90 disabled:opacity-30 disabled:pointer-events-none transition-all"
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
                className="rounded-control border border-border p-1.5 text-muted hover:bg-surface hover:text-foreground active:scale-90 disabled:opacity-30 disabled:pointer-events-none transition-all"
                title="انتقال یک ردیف به پایین"
              >
                <ArrowDownIcon size={16} />
              </button>
            )}

            {/* Add Widget */}
            {onAddWidget && (
              <Button
                variant="soft"
                onClick={onAddWidget}
                className="gap-1.5 py-1 px-2.5 text-xs active:scale-95 transition-transform"
              >
                <PlusIcon size={16} />
                افزودن ویجت
              </Button>
            )}

            {/* Delete Section with smooth animation */}
            {onDeleteSection && (
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-control border border-border p-1.5 text-muted hover:border-danger/30 hover:bg-danger-soft hover:text-danger active:scale-90 transition-all"
                title="حذف سکشن"
              >
                <TrashIcon size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* 12-Column Responsive Grid: Each Card Can Be Resized Individually */}
      {widgets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 transition-all duration-300">
          {widgets.map((widget) => (
            <ResizableCard
              key={widget.id}
              widget={widget}
              readOnly={readOnly}
              onEdit={onEditWidget ? () => onEditWidget(widget) : undefined}
              onDelete={onDeleteWidget ? () => onDeleteWidget(widget.id) : undefined}
              onResize={
                onResizeWidget
                  ? (newSpan) => onResizeWidget(widget.id, newSpan)
                  : undefined
              }
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-control border border-dashed border-border py-12 text-center transition-all animate-[fade-in_200ms_ease-out]">
          <p className="text-sm text-muted">این بخش هنوز هیچ ویجتی ندارد</p>
          {!readOnly && onAddWidget && (
            <Button
              variant="ghost"
              onClick={onAddWidget}
              className="mt-3 gap-1 py-1 px-2.5 text-xs active:scale-95 transition-transform"
            >
              <PlusIcon size={16} />
              افزودن اولین ویجت
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
