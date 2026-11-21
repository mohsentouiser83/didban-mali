"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  BlockFilter,
  BlockVisualization,
  CustomReportBlock,
  EntityFieldRegistry,
  ReportDataSource,
} from "@/lib/custom-reports";
import { OPERATOR_LABELS, VISUALIZATION_LABELS } from "@/lib/custom-reports";
import {
  ChartBarIcon,
  DatabaseIcon,
  FunnelIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";

interface BlockEditorProps {
  block: CustomReportBlock | null;
  isOpen: boolean;
  onClose: () => void;
  dataSources: ReportDataSource[];
  registry?: EntityFieldRegistry;
  onUpdate: (patch: Partial<CustomReportBlock>) => void;
  onAICompose?: (prompt: string) => void;
}

export function BlockEditor({
  block,
  isOpen,
  onClose,
  dataSources,
  registry,
  onUpdate,
}: BlockEditorProps) {
  const [activeTab, setActiveTab] = useState<"datasource" | "filters" | "viz">("datasource");

  if (!block || !isOpen) return null;

  const currentDataSource = dataSources.find((d) => d.value === block.entity_type);

  function handleAddFilter() {
    if (!block || !registry || !registry.filterable.length) return;
    const firstField = registry.filterable[0];
    const newFilter: BlockFilter = {
      field: firstField.key,
      operator: "=",
      value: firstField.choices?.[0]?.value || "",
    };
    onUpdate({ filters: [...block.filters, newFilter] });
  }

  function handleUpdateFilter(index: number, patch: Partial<BlockFilter>) {
    if (!block) return;
    const nextFilters = [...block.filters];
    nextFilters[index] = { ...nextFilters[index], ...patch };
    onUpdate({ filters: nextFilters });
  }

  function handleRemoveFilter(index: number) {
    if (!block) return;
    onUpdate({ filters: block.filters.filter((_, i) => i !== index) });
  }

  function toggleColumn(key: string) {
    if (!block) return;
    const cur = block.columns || [];
    const next = cur.includes(key) ? cur.filter((c) => c !== key) : [...cur, key];
    onUpdate({ columns: next });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()} title={`تنظیمات بلاک: ${block.title}`}>
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex border-b border-border pb-1">
          <button
            type="button"
            onClick={() => setActiveTab("datasource")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "datasource"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <DatabaseIcon size={16} />
            منبع داده
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("filters")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "filters"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <FunnelIcon size={16} />
            فیلترها ({block.filters.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("viz")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "viz"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <ChartBarIcon size={16} />
            نمایش و ستون‌ها
          </button>
        </div>

        {/* Tab 1: Data Source */}
        {activeTab === "datasource" && (
          <div className="space-y-4">
            <Field id="block-title" label="عنوان بلاک">
              <Input
                id="block-title"
                value={block.title}
                onChange={(e) => onUpdate({ title: e.target.value })}
                placeholder="عنوان این بخش از گزارش"
              />
            </Field>

            <Field id="block-entity" label="انتخاب منبع داده (Data Source)">
              <Select
                id="block-entity"
                value={block.entity_type}
                onValueChange={(val) => {
                  onUpdate({
                    entity_type: val,
                    filters: [],
                    columns: [],
                    group_by: null,
                  });
                }}
                options={dataSources.map((ds) => ({
                  value: ds.value,
                  label: `${ds.label_fa} (${ds.group})`,
                }))}
              />
            </Field>

            {currentDataSource && (
              <div className="rounded-control bg-surface-muted/50 p-3 text-xs text-muted">
                <span className="font-medium text-foreground">{currentDataSource.label_fa}: </span>
                {currentDataSource.description_fa}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Filters */}
        {activeTab === "filters" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">شروط فیلتر داده‌ها</span>
              <Button variant="soft" onClick={handleAddFilter} className="gap-1 text-xs">
                <PlusIcon size={14} />
                افزودن شرط
              </Button>
            </div>

            {block.filters.length === 0 ? (
              <div className="rounded-control border border-dashed border-border py-6 text-center text-xs text-muted">
                هیچ شرطی تعریف نشده است؛ تمام رکوردهای {currentDataSource?.label_fa || "منبع"} نمایش داده می‌شوند.
              </div>
            ) : (
              <div className="space-y-3">
                {block.filters.map((flt, idx) => {
                  const fDef = registry?.filterable.find((f) => f.key === flt.field);
                  return (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-surface p-2.5"
                    >
                      {/* Field */}
                      <div className="w-40">
                        <Select
                          value={flt.field}
                          onValueChange={(val) => {
                            const newFDef = registry?.filterable.find((f) => f.key === val);
                            handleUpdateFilter(idx, {
                              field: val,
                              value: newFDef?.choices?.[0]?.value || "",
                            });
                          }}
                          options={(registry?.filterable || []).map((f) => ({
                            value: f.key,
                            label: f.label_fa,
                          }))}
                        />
                      </div>

                      {/* Operator */}
                      <div className="w-32">
                        <Select
                          value={flt.operator}
                          onValueChange={(op) => handleUpdateFilter(idx, { operator: op })}
                          options={(fDef?.supported_operators || ["="]).map((op) => ({
                            value: op,
                            label: OPERATOR_LABELS[op] || op,
                          }))}
                        />
                      </div>

                      {/* Value */}
                      <div className="flex-1 min-w-[140px]">
                        {fDef?.choices && fDef.choices.length > 0 ? (
                          <Select
                            value={String(flt.value)}
                            onValueChange={(val) => handleUpdateFilter(idx, { value: val })}
                            options={fDef.choices.map((c) => ({
                              value: c.value,
                              label: c.label,
                            }))}
                          />
                        ) : fDef?.field_type === "boolean" ? (
                          <Select
                            value={String(flt.value)}
                            onValueChange={(val) => handleUpdateFilter(idx, { value: val === "true" })}
                            options={[
                              { value: "true", label: "بله" },
                              { value: "false", label: "خیر" },
                            ]}
                          />
                        ) : (
                          <Input
                            value={String(flt.value ?? "")}
                            onChange={(e) => handleUpdateFilter(idx, { value: e.target.value })}
                            placeholder="مقدار شرط"
                          />
                        )}
                      </div>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleRemoveFilter(idx)}
                        className="rounded-control p-1.5 text-rose hover:bg-rose-soft"
                      >
                        <TrashIcon size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Visualization & Columns */}
        {activeTab === "viz" && (
          <div className="space-y-4">
            <Field id="block-viz" label="نوع نمایش (Visualization)">
              <Select
                id="block-viz"
                value={block.visualization}
                onValueChange={(val) => onUpdate({ visualization: val as BlockVisualization })}
                options={Object.entries(VISUALIZATION_LABELS).map(([v, lbl]) => ({
                  value: v,
                  label: lbl,
                }))}
              />
            </Field>

            {/* Table Columns Selection */}
            {block.visualization === "data_table" && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-foreground">ستون‌های جدول</span>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-control border border-border p-3">
                  {(registry?.selectable || []).map((col) => {
                    const isChecked = (block.columns || []).includes(col.key);
                    return (
                      <Checkbox
                        key={col.key}
                        id={`col-${col.key}`}
                        checked={isChecked}
                        onCheckedChange={() => toggleColumn(col.key)}
                        label={col.label_fa}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Group By & Aggregation for Charts */}
            {block.visualization !== "data_table" && block.visualization !== "metric_strip" && (
              <div className="grid grid-cols-2 gap-3">
                <Field id="block-groupby" label="گروه‌بندی بر اساس محور">
                  <Select
                    id="block-groupby"
                    value={block.group_by || ""}
                    onValueChange={(val) => onUpdate({ group_by: val })}
                    options={(registry?.groupable || registry?.selectable || []).map((g) => ({
                      value: g.key,
                      label: g.label_fa,
                    }))}
                  />
                </Field>

                <Field id="block-agg" label="تابع محاسبه تجمیعی">
                  <Select
                    id="block-agg"
                    value={block.aggregation?.function || "count"}
                    onValueChange={(val) =>
                      onUpdate({
                        aggregation: {
                          function: val as "count" | "sum" | "avg",
                          field: val === "count" ? null : block.aggregation?.field,
                        },
                      })
                    }
                    options={[
                      { value: "count", label: "تعداد ردیف‌ها (Count)" },
                      { value: "sum", label: "مجموع مبالغ (Sum)" },
                      { value: "avg", label: "میانگین (Average)" },
                    ]}
                  />
                </Field>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-border">
          <Button variant="primary" onClick={onClose}>
            بستن و اعمال
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
