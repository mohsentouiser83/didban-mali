"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ENTITY_OPTIONS,
  WIDGET_TYPE_OPTIONS,
  type StudioEntityType,
  type StudioWidgetSpec,
  type StudioWidgetType,
} from "@/lib/report-studio";
import { useState } from "react";

const METRIC_OPTIONS: Record<StudioEntityType, { value: string; label: string }[]> = {
  invoices: [
    { value: "sales_total", label: "مجموع فروش" },
    { value: "sales_unpaid", label: "مانده وصول‌نشده فروش" },
    { value: "sales_overdue", label: "فاکتورهای سررسیدگذشته" },
    { value: "invoice_count", label: "تعداد کل فاکتورها" },
  ],
  ledger: [
    { value: "revenue", label: "درآمد کل دفتر" },
    { value: "expense", label: "هزینه‌های جاری دفتر" },
    { value: "pre_tax_profit", label: "سود پیش از مالیات" },
    { value: "cash", label: "مانده نقد و بانک" },
    { value: "ar_ledger", label: "مطالبات تجاری دفتری" },
    { value: "revenue_vs_expense", label: "مقایسه درآمد و هزینه" },
  ],
  parties: [
    { value: "top_debtors", label: "بزرگ‌ترین بدهکاران" },
    { value: "top_creditors", label: "بزرگ‌ترین بستانکاران" },
  ],
  cheques: [
    { value: "cheques_in_transit", label: "چک‌های دریافتنی در جریان" },
    { value: "cheques_payable", label: "چک‌های پرداختنی نزد دیگران" },
    { value: "cheques_bounced", label: "چک‌های برگشتی" },
    { value: "cheques_maturity", label: "سررسید چک‌ها" },
  ],
  payroll: [
    { value: "gross_salary", label: "مجموع ناخالص حقوق" },
    { value: "net_payable", label: "خالص پرداختی پرسنل" },
    { value: "insurance_tax", label: "بیمه و مالیات حقوق" },
    { value: "headcount", label: "تعداد پرسنل" },
  ],
  inventory: [
    { value: "stock_value", label: "ارزش ریالی موجودی انبار" },
    { value: "item_turnover", label: "گردش اقلام کالا" },
  ],
  dimensions: [
    { value: "cost_by_dimension", label: "هزینه به تفکیک مرکز هزینه" },
    { value: "revenue_by_dimension", label: "درآمد به تفکیک پروژه" },
  ],
};

function WidgetConfigForm({
  initialWidget,
  onSave,
  onCancel,
}: {
  initialWidget?: StudioWidgetSpec | null;
  onSave: (widget: StudioWidgetSpec) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialWidget?.title || "ویجت جدید");
  const [type, setType] = useState<StudioWidgetType>(initialWidget?.type || "kpi_card");
  const [entity, setEntity] = useState<StudioEntityType>(initialWidget?.entity || "invoices");
  const [metric, setMetric] = useState(initialWidget?.metric || "sales_total");
  const [groupBy, setGroupBy] = useState<StudioWidgetSpec["group_by"]>(
    initialWidget?.group_by || "none",
  );
  const [direction, setDirection] = useState<"all" | "sales" | "purchases">(
    initialWidget?.filters?.direction || "sales",
  );
  const [overdueOnly, setOverdueOnly] = useState(
    initialWidget?.filters?.overdue_only || false,
  );
  const [color, setColor] = useState(initialWidget?.color || "primary");

  function handleEntityChange(newEntity: StudioEntityType) {
    setEntity(newEntity);
    const validMetrics = METRIC_OPTIONS[newEntity] || [];
    if (validMetrics.length > 0) {
      setMetric(validMetrics[0].value);
    }
  }

  function handleSave() {
    const spec: StudioWidgetSpec = {
      id: initialWidget?.id || `w-${Date.now()}`,
      title: title.trim() || "ویجت بدون عنوان",
      type,
      entity,
      metric,
      group_by: groupBy,
      limit: 8,
      unit: initialWidget?.unit || "IRR",
      color,
      filters: {
        direction,
        overdue_only: overdueOnly,
      },
    };
    onSave(spec);
  }

  const currentMetricOptions = METRIC_OPTIONS[entity] || [];

  return (
    <div className="space-y-4 py-2">
      <Field id="w-title" label="عنوان ویجت">
        <Input
          id="w-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="مثلاً مجموع فروش دوره"
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field id="w-type" label="نوع ویجت">
          <Select
            id="w-type"
            value={type}
            onValueChange={(val) => setType(val as StudioWidgetType)}
            options={WIDGET_TYPE_OPTIONS}
          />
        </Field>

        <Field id="w-entity" label="انتیتی منبع">
          <Select
            id="w-entity"
            value={entity}
            onValueChange={(val) => handleEntityChange(val as StudioEntityType)}
            options={ENTITY_OPTIONS}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field id="w-metric" label="شاخص محاسباتی">
          <Select
            id="w-metric"
            value={metric}
            onValueChange={setMetric}
            options={currentMetricOptions}
          />
        </Field>

        <Field id="w-groupby" label="گروه‌بندی">
          <Select
            id="w-groupby"
            value={groupBy}
            onValueChange={(val) => setGroupBy(val as StudioWidgetSpec["group_by"])}
            options={[
              { value: "none", label: "بدون گروه‌بندی" },
              { value: "month", label: "ماهانه" },
              { value: "party", label: "به تفکیک طرف‌حساب" },
              { value: "category", label: "به تفکیک دسته‌بندی" },
            ]}
          />
        </Field>
      </div>

      {entity === "invoices" && (
        <div className="grid grid-cols-2 gap-4 rounded-control border border-border/60 bg-neutral-soft/30 p-3">
          <Field id="w-dir" label="دامنه فاکتور">
            <Select
              id="w-dir"
              value={direction}
              onValueChange={(val) => setDirection(val as "all" | "sales" | "purchases")}
              options={[
                { value: "all", label: "همه فاکتورها" },
                { value: "sales", label: "فقط فروش" },
                { value: "purchases", label: "فقط خرید" },
              ]}
            />
          </Field>

          <div className="flex items-center pt-6">
            <Checkbox
              id="w-overdue-checkbox"
              label="فقط سررسیدگذشته"
              checked={overdueOnly}
              onCheckedChange={(checked) => setOverdueOnly(Boolean(checked))}
            />
          </div>
        </div>
      )}

      <Field id="w-color" label="تم رنگی ویجت">
        <Select
          id="w-color"
          value={color}
          onValueChange={setColor}
          options={[
            { value: "primary", label: "امضای دیدبان (بنفش)" },
            { value: "emerald", label: "سبز موفقیت (درآمد/مثبت)" },
            { value: "amber", label: "کهربایی هشدار (مطالبات معوق)" },
            { value: "rose", label: "قرمز هزینه و بدهی" },
          ]}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-4 border-t border-border/60">
        <Button variant="ghost" onClick={onCancel}>
          انصراف
        </Button>
        <Button variant="primary" onClick={handleSave}>
          ذخیره ویجت
        </Button>
      </div>
    </div>
  );
}

export function WidgetConfigDialog({
  open,
  onOpenChange,
  initialWidget,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialWidget?: StudioWidgetSpec | null;
  onSave: (widget: StudioWidgetSpec) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialWidget ? "ویرایش ویجت" : "افزودن ویجت جدید"}
    >
      {open && (
        <WidgetConfigForm
          key={initialWidget?.id || "new-widget"}
          initialWidget={initialWidget}
          onSave={(widget) => {
            onSave(widget);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}
