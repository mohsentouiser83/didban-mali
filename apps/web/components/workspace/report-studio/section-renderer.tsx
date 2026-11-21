"use client";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  LAYOUT_OPTIONS,
  type RenderedSection,
  type StudioLayoutType,
  type StudioWidgetSpec,
} from "@/lib/report-studio";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { WidgetRenderer } from "./widget-renderer";

export function SectionRenderer({
  section,
  onUpdateLayout,
  onMoveUp,
  onMoveDown,
  onDeleteSection,
  onAddWidget,
  onEditWidget,
  onDeleteWidget,
  readOnly = false,
}: {
  section: RenderedSection;
  onUpdateLayout?: (layout: StudioLayoutType) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDeleteSection?: () => void;
  onAddWidget?: () => void;
  onEditWidget?: (widget: StudioWidgetSpec) => void;
  onDeleteWidget?: (widgetId: string) => void;
  readOnly?: boolean;
}) {
  const { title, description, layout, widgets } = section;

  let gridClasses = "grid grid-cols-1 gap-5";
  if (layout === "grid-2") gridClasses = "grid grid-cols-1 md:grid-cols-2 gap-5";
  if (layout === "grid-3") gridClasses = "grid grid-cols-1 md:grid-cols-3 gap-5";
  if (layout === "grid-4") gridClasses = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5";
  if (layout === "split-2-1" || layout === "split-1-2") gridClasses = "grid grid-cols-1 lg:grid-cols-3 gap-5";

  return (
    <div className="rounded-panel border border-border/80 bg-canvas/60 p-5 backdrop-blur-sm transition-all duration-200">
      {/* Section Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <h3 className="font-heading text-base font-medium text-foreground">
            {title || "بخش بدون عنوان"}
          </h3>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            {onUpdateLayout && (
              <div className="w-44">
                <Select
                  value={layout}
                  onValueChange={(val) => onUpdateLayout(val as StudioLayoutType)}
                  options={LAYOUT_OPTIONS}
                />
              </div>
            )}

            {onMoveUp && (
              <button
                type="button"
                onClick={onMoveUp}
                className="rounded-control border border-border p-1.5 text-muted hover:bg-surface hover:text-foreground"
                title="انتقال به بالا"
              >
                <ArrowUpIcon size={16} />
              </button>
            )}

            {onMoveDown && (
              <button
                type="button"
                onClick={onMoveDown}
                className="rounded-control border border-border p-1.5 text-muted hover:bg-surface hover:text-foreground"
                title="انتقال به پایین"
              >
                <ArrowDownIcon size={16} />
              </button>
            )}

            {onAddWidget && (
              <Button variant="soft" onClick={onAddWidget} className="gap-1.5 py-1 px-2.5 text-xs">
                <PlusIcon size={16} />
                افزودن ویجت
              </Button>
            )}

            {onDeleteSection && (
              <button
                type="button"
                onClick={onDeleteSection}
                className="rounded-control border border-border p-1.5 text-muted hover:border-rose/30 hover:bg-rose-soft hover:text-rose"
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
            if (layout === "split-2-1" && idx === 0) colSpanClass = "lg:col-span-2";
            if (layout === "split-1-2" && idx === 1) colSpanClass = "lg:col-span-2";

            return (
              <div key={widget.id} className={colSpanClass}>
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
        <div className="flex flex-col items-center justify-center rounded-control border border-dashed border-border py-12 text-center">
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
