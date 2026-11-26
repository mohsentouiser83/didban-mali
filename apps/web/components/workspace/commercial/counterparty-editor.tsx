"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusMessage } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { AmountInput, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { counterpartyForm } from "@/hooks/use-commercial";
import {
  counterpartyEntityKindOptions,
  counterpartyTypeOptions,
  type Counterparty,
  type CounterpartyEntityKind,
  type CounterpartyForm,
  type CounterpartyType,
} from "@/lib/commercial";

export function normalizeCounterpartyPayload(form: CounterpartyForm) {
  const roles = form.roles.length ? form.roles : (form.type ? [form.type] : []);
  const primaryType = form.type || (roles.length === 1 ? roles[0] : "other");
  return {
    ...form,
    type: primaryType,
    roles,
    name: form.name.trim(),
    national_id: form.national_id.trim() || null,
    economic_code: form.economic_code.trim() || null,
    registration_number:
      form.entity_kind === "natural_person" && !form.registration_number.trim()
        ? null
        : (form.registration_number.trim() || null),
    postal_code: form.postal_code.trim() || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    address: form.address.trim() || null,
    credit_limit_irr: form.credit_limit_irr || null,
  };
}

export function CounterpartyEditor({ row, readOnly, busy, error, onClose, onSave }: {
  row?: Counterparty;
  readOnly: boolean;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSave: (form: CounterpartyForm) => void;
}) {
  const [form, setForm] = useState(() => counterpartyForm(row));
  const isNaturalPerson = form.entity_kind === "natural_person";
  const showRegistrationNumber = !isNaturalPerson || Boolean(form.registration_number.trim());

  function update<K extends keyof CounterpartyForm>(key: K, value: CounterpartyForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function toggleRole(role: CounterpartyType, checked: boolean) {
    setForm((prev) => {
      const nextRoles = checked
        ? Array.from(new Set([...prev.roles, role]))
        : prev.roles.filter((r) => r !== role);
      const nextType = nextRoles.length === 1 ? nextRoles[0] : (nextRoles.length > 1 ? "other" : "");
      return { ...prev, roles: nextRoles, type: nextType };
    });
  }

  return (
    <Drawer
      open
      onOpenChange={onClose}
      title={row ? (readOnly ? "جزئیات طرف‌حساب" : "ویرایش طرف‌حساب") : "طرف‌حساب جدید"}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(form);
        }}
      >
        {row ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border/70 bg-canvas/50 px-3.5 py-2.5 text-sm">
            <span className="text-muted">کد داخلی طرف‌حساب (تخصیص از شماره‌گذاری شرکت):</span>
            <Badge tone="neutral"><bdi>{row.code}</bdi></Badge>
          </div>
        ) : (
          <StatusMessage tone="primary">
            کد داخلی طرف‌حساب پس از ذخیره به‌صورت خودکار مطابق قاعدهٔ شماره‌گذاری شرکت تخصیص می‌یابد.
          </StatusMessage>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="party-name" label="نام" required>
            <Input
              id="party-name"
              value={form.name}
              maxLength={200}
              required
              readOnly={readOnly}
              onChange={(event) => update("name", event.target.value)}
            />
          </Field>
          <Field id="party-entity-kind" label="نوع شخصیت" required>
            <Select
              id="party-entity-kind"
              value={form.entity_kind}
              options={[...counterpartyEntityKindOptions]}
              disabled={readOnly || busy}
              onValueChange={(value) => update("entity_kind", value as CounterpartyEntityKind)}
            />
          </Field>
          <Field id="party-credit" label="سقف اعتبار (ریال)">
            <AmountInput
              id="party-credit"
              value={form.credit_limit_irr}
              maxLength={80}
              readOnly={readOnly}
              onValueChange={(value) => update("credit_limit_irr", value)}
            />
          </Field>
          <Field id="party-national_id" label={isNaturalPerson ? "کد ملی" : "شناسه ملی"}>
            <Input
              id="party-national_id"
              value={form.national_id}
              maxLength={20}
              dir="ltr"
              readOnly={readOnly}
              onChange={(event) => update("national_id", event.target.value)}
            />
          </Field>
        </div>

        <Field id="party-roles" label="نقش‌های تجاری" required>
          <div className="flex flex-wrap gap-4 pt-1">
            {counterpartyTypeOptions.map((option) => (
              <Checkbox
                key={option.value}
                id={`party-role-${option.value}`}
                checked={form.roles.includes(option.value)}
                disabled={readOnly || busy}
                onCheckedChange={(checked) => toggleRole(option.value, Boolean(checked))}
                label={option.label}
              />
            ))}
          </div>
        </Field>

        <div className="space-y-3 rounded-control border border-border/70 bg-canvas/40 p-3.5">
          <h3 className="text-sm font-medium text-foreground">مشخصات ثبتی و مالیاتی</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {showRegistrationNumber && (
              <Field id="party-registration_number" label="شماره ثبت">
                <Input
                  id="party-registration_number"
                  value={form.registration_number}
                  maxLength={40}
                  dir="ltr"
                  readOnly={readOnly}
                  onChange={(event) => update("registration_number", event.target.value)}
                />
              </Field>
            )}
            <Field
              id="party-economic_code"
              label={isNaturalPerson ? "کد اقتصادی (اختیاری)" : "کد اقتصادی"}
            >
              <Input
                id="party-economic_code"
                value={form.economic_code}
                maxLength={20}
                dir="ltr"
                readOnly={readOnly}
                onChange={(event) => update("economic_code", event.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="space-y-3 rounded-control border border-border/70 bg-canvas/40 p-3.5">
          <h3 className="text-sm font-medium text-foreground">راه‌های تماس و نشانی</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="party-phone" label="تلفن">
              <Input
                id="party-phone"
                value={form.phone}
                maxLength={50}
                dir="ltr"
                readOnly={readOnly}
                onChange={(event) => update("phone", event.target.value)}
              />
            </Field>
            <Field id="party-email" label="ایمیل">
              <Input
                id="party-email"
                value={form.email}
                maxLength={150}
                dir="ltr"
                readOnly={readOnly}
                onChange={(event) => update("email", event.target.value)}
              />
            </Field>
            <Field id="party-postal_code" label="کد پستی">
              <Input
                id="party-postal_code"
                value={form.postal_code}
                maxLength={20}
                dir="ltr"
                readOnly={readOnly}
                onChange={(event) => update("postal_code", event.target.value)}
              />
            </Field>
          </div>
          <Field id="party-address" label="نشانی">
            <Textarea
              id="party-address"
              value={form.address}
              maxLength={500}
              readOnly={readOnly}
              onChange={(event) => update("address", event.target.value)}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span>طرف‌حساب فعال</span>
          <Switch
            label="طرف‌حساب فعال"
            checked={form.active}
            disabled={readOnly || busy}
            onCheckedChange={(value) => update("active", value)}
          />
        </div>

        <FormMessage error>{error}</FormMessage>
        {!readOnly && (
          <Button type="submit" busy={busy} disabled={!form.name.trim() || !form.roles.length}>
            ذخیره
          </Button>
        )}
      </form>
    </Drawer>
  );
}
