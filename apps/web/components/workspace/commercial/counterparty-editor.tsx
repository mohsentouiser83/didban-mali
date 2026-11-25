"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { AmountInput, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  counterpartyEntityKindOptions,
  counterpartyTypeOptions,
  type CounterpartyEntityKind,
  type CounterpartyType,
} from "@/lib/commercial";
import { Switch } from "@/components/ui/switch";
import { counterpartyForm } from "@/hooks/use-commercial";
import type { Counterparty, CounterpartyForm } from "@/lib/commercial";

const fields = [
  ["name", "نام", 200],
  ["national_id", "کد / شناسه ملی", 20],
  ["economic_code", "کد اقتصادی", 20],
  ["registration_number", "شماره ثبت", 40],
  ["phone", "تلفن", 50],
  ["postal_code", "کد پستی", 20],
  ["email", "ایمیل", 150],
] as const;

export function CounterpartyEditor({ row, readOnly, busy, error, onClose, onSave }: {
  row?: Counterparty;
  readOnly: boolean;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSave: (form: CounterpartyForm) => void;
}) {
  const [form, setForm] = useState(() => counterpartyForm(row));
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
    <Drawer open onOpenChange={onClose} title={row ? (readOnly ? "پرونده طرف‌حساب" : "ویرایش طرف‌حساب") : "طرف‌حساب جدید"}>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <div className="grid gap-4 sm:grid-cols-2">
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
            <AmountInput id="party-credit" value={form.credit_limit_irr} maxLength={80}
              readOnly={readOnly} onValueChange={(value) => update("credit_limit_irr", value)} />
          </Field>
          {fields.map(([key, label, maxLength]) => (
            <Field key={key} id={`party-${key}`} label={label}>
              <Input id={`party-${key}`} value={form[key]} maxLength={maxLength}
                required={key === "name"} readOnly={readOnly}
                onChange={(event) => update(key, event.target.value)} />
            </Field>
          ))}
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
        <Field id="party-address" label="نشانی">
          <Textarea id="party-address" value={form.address} maxLength={500}
            readOnly={readOnly} onChange={(event) => update("address", event.target.value)} />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <span>طرف‌حساب فعال</span>
          <Switch label="طرف‌حساب فعال" checked={form.active} disabled={readOnly || busy}
            onCheckedChange={(value) => update("active", value)} />
        </div>
        <FormMessage error>{error}</FormMessage>
        {!readOnly && <Button type="submit" busy={busy} disabled={!form.name.trim() || !form.roles.length}>ذخیره</Button>}
      </form>
    </Drawer>
  );
}
