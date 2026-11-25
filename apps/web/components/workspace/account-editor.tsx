"use client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/ui/content-states";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ACCOUNT_LEVEL_OPTIONS,
  ACCOUNT_ROLE_OPTIONS,
  type AccountLevel,
} from "@/lib/account-catalogue";
import { ACCOUNT_NATURE_OPTIONS, type AccountNature } from "@/lib/accounting";
import type { useLedgerAccounts } from "@/hooks/use-ledger-accounts";

type Controller = ReturnType<typeof useLedgerAccounts>;
export function AccountEditor({ view, editable }: { view: Controller; editable: boolean }) {
  const disabled = !editable || view.command.busy;
  return (
    <Form fieldErrors={{ ...view.command.error?.fields, ...view.errors }} onSubmit={(event) => {
      event.preventDefault(); view.save();
    }}>
      <Field id="ledger-level" name="level" label="سطح حساب" required>
        <Select id="ledger-level" value={view.value.level} options={ACCOUNT_LEVEL_OPTIONS} disabled={disabled}
          onValueChange={(level) => view.change({ level: level as AccountLevel })} />
      </Field>
      {view.parentLevel && (
        <Field id="ledger-parent" name="parent_id" label={view.parentLabel} required>
          <Select id="ledger-parent" value={view.value.parent_id} options={view.parentOptions}
            searchable searchPlaceholder="جستجوی حساب بالادست..."
            disabled={disabled || view.catalogue.loading || !!view.catalogue.error}
            placeholder={view.catalogue.loading ? "در حال دریافت حساب‌ها…" : "انتخاب کنید"}
            onValueChange={(parent_id) => view.change({ parent_id })} />
        </Field>
      )}
      {view.catalogue.error && view.parentLevel && <ErrorState message={view.catalogue.error.message} onRetry={view.catalogue.refresh} />}
      <Field
        id="ledger-code"
        name="code"
        label="کد حساب"
        description={
          view.editing?.code_status === "legacy"
            ? "این حساب دارای کد قدیمی پیش از ساختار چهارسطحی است؛ کد آن ثابت می‌ماند و سایر مشخصات قابل ویرایش‌اند."
            : view.codeHint || undefined
        }
      >
        <Input id="ledger-code" required dir="ltr" maxLength={100} value={view.value.code}
          readOnly={!!view.editing} disabled={disabled}
          onChange={(event) => view.change({ code: event.target.value })} />
      </Field>
      <Field id="ledger-name" name="name" label="نام حساب">
        <Input id="ledger-name" required maxLength={150} value={view.value.name} disabled={disabled}
          onChange={(event) => view.change({ name: event.target.value })} />
      </Field>
      <Field id="ledger-nature" name="nature" label="ماهیت حساب" required>
        <Select id="ledger-nature" value={view.value.nature} disabled={disabled} options={ACCOUNT_NATURE_OPTIONS}
          onValueChange={(nature) => view.change({ nature: nature as AccountNature })} />
      </Field>
      <Field id="ledger-role" name="role" label="نقش حساب (بانک، صندوق، تنخواه، ...)">
        <Select
          id="ledger-role"
          value={view.value.role || "unassigned"}
          options={ACCOUNT_ROLE_OPTIONS}
          disabled={disabled}
          onValueChange={(role) =>
            view.change({ role: role === "unassigned" ? "" : role })
          }
        />
      </Field>
      <Checkbox id="ledger-active" label="حساب فعال" checked={view.value.active} disabled={disabled}
        onCheckedChange={(active) => view.change({ active })} />
      <FormMessage error>{view.command.error?.message}</FormMessage>
      {editable && <Button type="submit" busy={view.command.busy}>ذخیره حساب</Button>}
    </Form>
  );
}
