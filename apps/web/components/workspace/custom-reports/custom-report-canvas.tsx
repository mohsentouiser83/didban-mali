"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useCustomReportBuilder } from "@/hooks/use-custom-report-builder";
import { BlockCard } from "./block-card";
import { BlockEditor } from "./block-editor";
import {
  DownloadSimpleIcon,
  FloppyDiskIcon,
  PlusIcon,
  SparkleIcon,
} from "@phosphor-icons/react";

export function CustomReportCanvas() {
  const c = useCustomReportBuilder();
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

  const editingBlock = c.blocks.find((b) => b.id === editingBlockId) || null;
  const currentRegistry = editingBlock ? c.registries[editingBlock.entity_type] : undefined;

  return (
    <div className="space-y-6">
      {/* 1. AI Quick Composer Banner */}
      <div className="relative overflow-hidden rounded-panel border border-primary/20 bg-gradient-to-r from-primary-soft/40 via-surface to-primary-soft/20 p-5 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <SparkleIcon size={20} className="text-primary animate-pulse" />
          <h3 className="font-heading text-sm font-medium text-foreground">
            دستیار هوشمند طراحی گزارش (AI Report Composer)
          </h3>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void c.aiCompose();
          }}
          className="flex flex-wrap gap-2"
        >
          <div className="flex-1 min-w-[240px]">
            <Input
              aria-label="درخواست گزارش"
              placeholder="درخواست گزارش"
              value={c.aiPrompt}
              onChange={(e) => c.setAiPrompt(e.target.value)}
              disabled={c.aiLoading}
            />
          </div>
          <Button type="submit" variant="primary" busy={c.aiLoading} className="gap-1.5 shrink-0">
            <SparkleIcon size={16} />
            تولید هوشمند بلاک
          </Button>
        </form>
        {c.aiMessage && (
          <p className="mt-2 text-xs text-primary font-medium">{c.aiMessage}</p>
        )}
      </div>

      {/* 2. Report Canvas Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Field id="report-name" label="">
            <Input
              id="report-name"
              value={c.reportName}
              onChange={(e) => c.setReportName(e.target.value)}
              placeholder="نام گزارش..."
              className="font-heading font-medium text-base h-10 w-64"
            />
          </Field>

          {c.savedDefinitions.length > 0 && (
            <div className="w-56">
              <Select
                value=""
                onValueChange={(id) => {
                  const def = c.savedDefinitions.find((d) => d.id === id);
                  if (def) c.loadReportTemplate(def);
                }}
                options={[
                  { value: "", label: "بارگذاری قالب‌های ذخیره‌شده..." },
                  ...c.savedDefinitions.map((d) => ({
                    value: d.id,
                    label: d.name,
                  })),
                ]}
              />
            </div>
          )}

          <span className="text-xs text-muted">
            {c.blocks.length} بلاک تحلیلی در بوم
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="soft"
            onClick={() => {
              c.addBlock({
                title: "بلاک تحلیلی جدید",
                entity_type: "invoices",
                visualization: "data_table",
              });
            }}
            className="gap-1.5 text-xs"
          >
            <PlusIcon size={16} />
            افزودن بلاک
          </Button>

          <Button
            variant="secondary"
            onClick={() => void c.saveReportTemplate()}
            className="gap-1.5 text-xs"
          >
            <FloppyDiskIcon size={16} />
            ذخیره قالب
          </Button>

          <div className="flex items-center gap-1 border-r border-border pr-2">
            <Button
              variant="ghost"
              busy={c.exporting}
              onClick={() => void c.exportReport("xlsx")}
              className="gap-1.5 text-xs text-primary"
            >
              <DownloadSimpleIcon size={16} />
              خروجی اکسل
            </Button>
            <Button
              variant="ghost"
              busy={c.exporting}
              onClick={() => void c.exportReport("pdf")}
              className="gap-1.5 text-xs text-secondary"
            >
              <DownloadSimpleIcon size={16} />
              خروجی PDF
            </Button>
          </div>
        </div>
      </div>

      {c.saveSuccess && (
        <div className="rounded-control bg-emerald-soft/30 p-3 text-xs text-emerald font-medium">
          {c.saveSuccess}
        </div>
      )}

      {/* 3. Block Grid / Canvas */}
      {c.blocks.length === 0 ? (
        <div className="rounded-panel border-2 border-dashed border-border py-12 text-center">
          <p className="text-sm font-medium text-foreground">هیچ بلاکی در گزارش وجود ندارد.</p>
          <Button
            variant="soft"
            onClick={() => c.addBlock()}
            className="mt-4 gap-1.5 text-xs"
          >
            <PlusIcon size={16} />
            افزودن اولین بلاک
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-5">
          {c.blocks.map((block, idx) => {
            const ds = c.dataSources.find((d) => d.value === block.entity_type);
            const prev = c.blockPreviews[block.id];
            return (
              <BlockCard
                key={block.id}
                block={block}
                preview={prev}
                isSelected={c.activeBlockId === block.id}
                dataSource={ds}
                onSelect={() => c.setActiveBlockId(block.id)}
                onEdit={() => setEditingBlockId(block.id)}
                onDelete={() => c.removeBlock(block.id)}
                onDuplicate={() => c.duplicateBlock(block.id)}
                onMoveUp={idx > 0 ? () => c.moveBlock(block.id, "up") : undefined}
                onMoveDown={idx < c.blocks.length - 1 ? () => c.moveBlock(block.id, "down") : undefined}
                onChangeWidth={(w) => c.updateBlock(block.id, { width: w })}
              />
            );
          })}
        </div>
      )}

      {/* 4. Block Editor Dialog */}
      <BlockEditor
        block={editingBlock}
        isOpen={Boolean(editingBlockId)}
        onClose={() => setEditingBlockId(null)}
        dataSources={c.dataSources}
        registry={currentRegistry}
        onUpdate={(patch) => {
          if (editingBlockId) {
            c.updateBlock(editingBlockId, patch);
          }
        }}
      />
    </div>
  );
}
