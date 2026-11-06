"use client";
import { DrawerAction } from "@/components/ui/drawer-action";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Field, FormMessage } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { persian } from "@/lib/utils";
import type { useConsolidation } from "@/hooks/use-consolidation";
export function ConsolidationPairForm({
  view,
}: {
  view: ReturnType<typeof useConsolidation>;
}) {
  return (
    <DrawerAction title="پیش‌نویس حذف درون‌گروهی" action="ثبت زوج‌های حذف" busy={view.command.busy}><Form
      fieldErrors={view.command.error?.fields}
      onSubmit={(event) => {
        event.preventDefault();
        view.saveDraft();
      }}
    >
      {view.pairs.map((pair, index) => (
        <fieldset
          key={index}
          className="space-y-4 rounded-panel border border-border p-4"
        >
          <legend className="px-2">زوج {persian(index + 1)}</legend>
          <Field id={`pair-map-${index}`} label="نگاشت متقابل">
            <Select
              id={`pair-map-${index}`}
              value={pair.mapping_id}
              options={view.mappingOptions}
              onValueChange={(mapping_id) =>
                view.changePair(index, { mapping_id })
              }
            />
          </Field>
          <Field id={`pair-kind-${index}`} label="نوع پیشنهاد حذف">
            <Select
              id={`pair-kind-${index}`}
              value={pair.kind}
              options={[
                { value: "services", label: "درآمد و هزینهٔ خدمات جاری" },
                { value: "balance", label: "مطالبات و بدهی تجاری احرازشده" },
              ]}
              onValueChange={(kind) =>
                view.changePair(index, { kind: kind as "services" | "balance" })
              }
            />
          </Field>
          <Field id={`pair-left-${index}`} label="ردیف شرکت اول">
            <Select
              id={`pair-left-${index}`}
              value={pair.left_line_id}
              options={pair.leftOptions}
              onValueChange={(left_line_id) =>
                view.changePair(index, { left_line_id })
              }
            />
          </Field>
          <Field id={`pair-right-${index}`} label="ردیف شرکت دوم">
            <Select
              id={`pair-right-${index}`}
              value={pair.right_line_id}
              options={pair.rightOptions}
              onValueChange={(right_line_id) =>
                view.changePair(index, { right_line_id })
              }
            />
          </Field>
          <Field id={`pair-reason-${index}`} label="دلیل بررسی زوج">
            <Textarea
              id={`pair-reason-${index}`}
              required
              maxLength={500}
              value={pair.review_reason}
              onChange={(event) =>
                view.changePair(index, { review_reason: event.target.value })
              }
            />
          </Field>
          {view.pairs.length > 1 && (
            <Button variant="ghost" onClick={() => view.removePair(index)}>
              حذف زوج
            </Button>
          )}
        </fieldset>
      ))}
      <Button variant="secondary" onClick={view.addPair}>
        افزودن زوج
      </Button>
      <FormMessage error>{view.command.error?.message}</FormMessage>
      <Button type="submit" busy={view.command.busy} disabled={!view.canDraft}>
        ذخیره پیش‌نویس حذف
      </Button>
    </Form></DrawerAction>
  );
}
