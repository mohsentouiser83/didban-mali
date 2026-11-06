"use client";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { AmountInput, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import type { Hypothetical, ScenarioEvent } from "@/lib/cash-scenarios";
import type { ApiError } from "@/lib/api";
export interface ScenarioFormController {
  local: {
    item: unknown;
    name: string;
    shifts: Record<string, string>;
    hypothetical: Hypothetical[];
  };
  baseline?: { start: string; events: ScenarioEvent[] };
  command: { busy: boolean; error?: ApiError };
  view: { workspace: { unit: "IRR" | "TOMAN" } };
  set: (patch: { name?: string; shifts?: Record<string, string> }) => void;
  save: () => Promise<unknown>;
  updateHypothetical: (index: number, patch: Partial<Hypothetical>) => void;
  removeHypothetical: (index: number) => void;
  addHypothetical: () => void;
}
import { amount, displayDate } from "@/lib/utils";
import { DrawerAction } from "@/components/ui/drawer-action";
export function ScenarioForm({
  controller: c,
  showShifts = true,
}: {
  controller: ScenarioFormController;
  showShifts?: boolean;
}) {
  return (
    <DrawerAction title={c.local.item ? "ویرایش فرض‌ها" : "سناریوی تازه"} busy={c.command.busy}>
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          void c.save();
        }}
        fieldErrors={c.command.error?.fields}
      >
        <Field id="scenario-name" label="نام سناریو">
          <Input
            id="scenario-name"
            disabled={c.command.busy}
            required
            maxLength={120}
            value={c.local.name}
            onChange={(e) => c.set({ name: e.target.value })}
          />
        </Field>
        {showShifts && (
          <fieldset disabled={c.command.busy} className="space-y-4">
            <legend className="mb-3 font-medium">
              تغییر تاریخ رویدادهای مبنا
            </legend>
            {c.baseline?.events.length === 0 && (
              <p className="text-muted">رویدادی در افق مبنا نیست.</p>
            )}
            {c.baseline?.events.map((event, index) => (
              <div
                key={event.event_id}
                className="grid gap-3 rounded-control border border-border p-3 sm:grid-cols-2"
              >
                <div>
                  <p>
                    {event.direction === "receipt" ? "دریافت" : "پرداخت"}{" "}
                    {event.obligation_id}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {amount(event.amount, c.view.workspace.unit)}{" "}
                    {c.view.workspace.unit === "IRR" ? "ریال" : "تومان"} ·{" "}
                    {displayDate(event.date)}
                  </p>
                </div>
                <Field id={`shift-${index}`} label="تاریخ در سناریو">
                  <PersianDatePicker
                    id={`shift-${index}`}
                    value={c.local.shifts[event.event_id] || event.date}
                    onChange={(date) =>
                      c.set({
                        shifts: { ...c.local.shifts, [event.event_id]: date },
                      })
                    }
                    label={`تاریخ سناریوی رویداد ${index + 1}`}
                  />
                </Field>
              </div>
            ))}
          </fieldset>
        )}
        <fieldset disabled={c.command.busy} className="space-y-4">
          <legend className="mb-3 font-medium">دریافت و پرداخت فرضی</legend>
          {c.local.hypothetical.map((event, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-control border border-border p-3 sm:grid-cols-2"
            >
              <Field id={`hyp-label-${index}`} label="عنوان">
                <Input
                  id={`hyp-label-${index}`}
                  required
                  value={event.label}
                  onChange={(e) =>
                    c.updateHypothetical(index, { label: e.target.value })
                  }
                />
              </Field>
              <Field id={`hyp-direction-${index}`} label="نوع">
                <Select
                  id={`hyp-direction-${index}`}
                  value={event.direction}
                  onValueChange={(value) =>
                    c.updateHypothetical(index, {
                      direction: value as "receipt" | "payment",
                    })
                  }
                  options={[
                    { value: "receipt", label: "دریافت" },
                    { value: "payment", label: "پرداخت" },
                  ]}
                />
              </Field>
              <Field id={`hyp-amount-${index}`} label="مبلغ">
                <AmountInput
                  id={`hyp-amount-${index}`}
                  required
                  value={event.amount}
                  onValueChange={(amount) =>
                    c.updateHypothetical(index, { amount })
                  }
                />
              </Field>
              <Field id={`hyp-unit-${index}`} label="واحد">
                <Select
                  id={`hyp-unit-${index}`}
                  value={event.unit}
                  onValueChange={(value) =>
                    c.updateHypothetical(index, {
                      unit: value as "IRR" | "TOMAN",
                    })
                  }
                  options={[
                    { value: "IRR", label: "ریال" },
                    { value: "TOMAN", label: "تومان" },
                  ]}
                />
              </Field>
              <Field id={`hyp-date-${index}`} label="تاریخ">
                <PersianDatePicker
                  id={`hyp-date-${index}`}
                  value={event.date}
                  onChange={(date) => c.updateHypothetical(index, { date })}
                  label={`تاریخ رویداد فرضی ${index + 1}`}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                onClick={() => c.removeHypothetical(index)}
              >
                حذف رویداد فرضی
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={c.addHypothetical}>
            افزودن رویداد فرضی
          </Button>
        </fieldset>
        {c.command.error && (
          <FormMessage error>{c.command.error.message}</FormMessage>
        )}
        <Button type="submit" disabled={c.command.busy || !c.baseline}>
          {c.command.busy ? "در حال محاسبه…" : "محاسبه و ذخیره"}
        </Button>
      </Form>
    </DrawerAction>
  );
}
