"use client";
import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState, StatusMessage } from "@/components/ui/content-states";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ACCOUNT_LEVEL_OPTIONS,
  ACCOUNT_ROLE_OPTIONS,
  accountLevelLabel,
  childAccountLevel,
  type AccountLevel,
} from "@/lib/account-catalogue";
import { ACCOUNT_NATURE_OPTIONS, type AccountNature } from "@/lib/accounting";
import type { useLedgerAccounts } from "@/hooks/use-ledger-accounts";

type Controller = ReturnType<typeof useLedgerAccounts>;
export function AccountEditor({ view, editable }: { view: Controller; editable: boolean }) {
  const disabled = !editable || view.command.busy;
  const childLevel = view.editing ? childAccountLevel(view.editing.level) : null;
  const canAddChild = Boolean(
    editable &&
      view.editing &&
      childLevel &&
      view.editing.can_add_standard_child !== false,
  );
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
        required
      >
        <div className="space-y-2">
          <Input id="ledger-code" required dir="ltr" maxLength={100} value={view.value.code}
            readOnly={!!view.editing} disabled={disabled}
            onChange={(event) => view.change({ code: event.target.value })} />
          {!view.editing && editable && view.suggestedCode && (
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              <span>
                کد پیشنهادی: <bdi className="font-mono text-primary">{view.suggestedCode}</bdi>
              </span>
              {view.value.code !== view.suggestedCode && (
                <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={view.applySuggestedCode}>
                  درج کد پیشنهادی
                </Button>
              )}
            </div>
          )}
          {canAddChild && view.editing && childLevel && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                className="h-8 gap-1 px-2.5 text-xs"
                onClick={() => view.openChild(view.editing!)}
              >
                <PlusIcon size={14} aria-hidden />
                افزودن زیرحساب ({accountLevelLabel(childLevel)})
              </Button>
            </div>
          )}
        </div>
      </Field>
      <Field id="ledger-name" name="name" label="نام حساب" required>
        <Input id="ledger-name" required maxLength={150} value={view.value.name} disabled={disabled}
          onChange={(event) => view.change({ name: event.target.value })} />
      </Field>
      <Field id="ledger-nature" name="nature" label="ماهیت حساب" required>
        <Select id="ledger-nature" value={view.value.nature} disabled={disabled} options={ACCOUNT_NATURE_OPTIONS}
          onValueChange={(nature) => view.change({ nature: nature as AccountNature })} />
      </Field>
      <Field
        id="ledger-role"
        name="role"
        label="نقش حساب"
        description="شامل نقش‌های خزانه، مطالبات/بدهی، درآمد/هزینه، حقوق و حساب‌های کاهش ارزش موجودی (D35)."
      >
        <Select
          id="ledger-role"
          value={view.value.role || "unassigned"}
          options={ACCOUNT_ROLE_OPTIONS}
          searchable
          searchPlaceholder="جستجوی نقش حساب..."
          disabled={disabled}
          onValueChange={(role) =>
            view.change({ role: role === "unassigned" ? "" : role })
          }
        />
      </Field>
      <Checkbox id="ledger-active" label="حساب فعال" checked={view.value.active} disabled={disabled}
        onCheckedChange={(active) => view.change({ active })} />
      {view.editing && !view.value.active && (
        <StatusMessage tone="warning">
          با غیرفعالسازی این حساب، سابقهٔ اسناد و گزارش‌های پیشین حفظ می‌شود، اما امکان انتخاب این حساب در اسناد و عملیات جدید وجود نخواهد داشت.
        </StatusMessage>
      )}
      <FormMessage error>{view.command.error?.message}</FormMessage>
      {editable && <Button type="submit" busy={view.command.busy}>ذخیره حساب</Button>}
    </Form>
  );
}
