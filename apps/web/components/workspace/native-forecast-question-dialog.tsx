"use client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import type { useNativeForecasts } from "@/hooks/use-native-forecasts";
import { nativeForecastReasons } from "@/lib/native-forecast";
import { amount } from "@/lib/utils";
export function NativeForecastQuestionDialog({
  controller: c,
}: {
  controller: ReturnType<typeof useNativeForecasts>;
}) {
  return (
    <Dialog
      open={c.dialogOpen}
      onOpenChange={c.setDialogOpen}
      title={c.question?.title || "پرسش پیش‌بینی"}
    >
      {c.question && (
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            c.answer();
          }}
          fieldErrors={c.command.error?.fields}
        >
          <p>
            {c.question.reference} ·{" "}
            {amount(c.question.amount, c.workspace.unit)}
          </p>
          {c.question.kind === "choice" ? (
            <Select
              label="ارتباط با فاکتور"
              value={c.choice}
              onValueChange={c.setChoice}
              options={[
                {
                  value: "covered_by_invoice",
                  label: "در مبلغ فاکتور منظور شده",
                },
                {
                  value: "separate_obligation",
                  label: "تعهد مستقل و جدا از فاکتور است",
                },
                { value: "unknown", label: "نامعلوم" },
              ]}
            />
          ) : (
            <>
              <p className="text-sm text-muted">
                {nativeForecastReasons[c.question.reason_code] ||
                  "تاریخ مورد انتظار را مشخص کنید."}
              </p>
              <Field id="native-forecast-answer-date" label="تاریخ مورد انتظار">
                <PersianDatePicker
                  id="native-forecast-answer-date"
                  label="تاریخ مورد انتظار دریافت یا پرداخت"
                  value={c.date}
                  onChange={c.setDate}
                  disabled={c.unknown}
                />
              </Field>
              <Checkbox
                id="native-forecast-date-unknown"
                label="زمان نامعلوم است"
                checked={c.unknown}
                onCheckedChange={c.setUnknown}
              />
            </>
          )}
          <FormMessage error>{c.command.error?.message}</FormMessage>
          <Button type="submit" disabled={!c.canAnswer} busy={c.command.busy}>
            ثبت پاسخ
          </Button>
        </Form>
      )}
    </Dialog>
  );
}
