"use client";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input, AmountInput } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import type { ChequeController } from "@/hooks/use-cheques";
export function ChequeForm({ c }: { c: ChequeController }) {
  return (
    <Drawer
      title="ثبت چک"
      open={c.creating}
      onOpenChange={(open) => {
        if (!c.command.busy) c.setCreating(open);
      }}
    >
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          c.create();
        }}
        fieldErrors={c.command.error?.fields}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cheque-direction" label="نوع چک" required>
            <Select
              id="cheque-direction"
              value={c.form.direction}
              disabled={c.command.busy}
              onValueChange={(direction) =>
                c.change({ direction: direction as "received" | "issued" })
              }
              options={[
                { value: "received", label: "دریافتنی" },
                { value: "issued", label: "پرداختنی" },
                { value: "guarantee_in", label: "تضمین دیگران نزد ما" },
                { value: "guarantee_out", label: "تضمین ما نزد دیگران" },
              ]}
            />
          </Field>
          <Field id="cheque-number" name="number" label="شماره چک">
            <Input
              id="cheque-number"
              dir="ltr"
              required
              maxLength={100}
              value={c.form.number}
              onChange={(e) => c.change({ number: e.target.value })}
            />
          </Field>
          <Field id="cheque-party" name="party_id" label="طرف حساب">
            <Input
              id="cheque-party"
              required
              maxLength={100}
              value={c.form.party_id}
              onChange={(e) => c.change({ party_id: e.target.value })}
            />
          </Field>
          <Field id="cheque-bank" name="bank_name" label="بانک صادرکننده">
            <Input
              id="cheque-bank"
              required
              maxLength={120}
              value={c.form.bank_name}
              onChange={(e) => c.change({ bank_name: e.target.value })}
            />
          </Field>
          <Field
            id="cheque-account"
            name="bank_account"
            label={
              c.form.direction === "issued"
                ? "حساب صادرکننده شرکت"
                : "حساب صادرکننده چک"
            }
          >
            <Input
              id="cheque-account"
              dir="ltr"
              required
              maxLength={100}
              value={c.form.bank_account}
              onChange={(e) => c.change({ bank_account: e.target.value })}
            />
          </Field>
          <Field id="cheque-amount" name="amount" label="مبلغ (ریال)">
            <AmountInput
              id="cheque-amount"
              required
              value={c.form.amount}
              onValueChange={(amount) => c.change({ amount })}
            />
          </Field>
          <Field
            id="cheque-issue"
            name="issue_date"
            label="تاریخ دریافت یا صدور"
            error={c.errors["cheque-issue"]}
            required
          >
            <PersianDatePicker
              id="cheque-issue"
              value={c.form.issue_date}
              onChange={(issue_date) => c.change({ issue_date })}
            />
          </Field>
          <Field
            id="cheque-due"
            name="due_date"
            label="سررسید"
            error={c.errors["cheque-due"]}
            required
          >
            <PersianDatePicker
              id="cheque-due"
              value={c.form.due_date}
              onChange={(due_date) => c.change({ due_date })}
            />
          </Field>
        </div>
        <FormMessage error>{!c.workspace.periodId ? "دوره را از هدر انتخاب کنید." : c.command.error?.message}</FormMessage>
        <Button type="submit" busy={c.command.busy}>
          ثبت اطلاعات چک
        </Button>
      </Form>
    </Drawer>
  );
}
