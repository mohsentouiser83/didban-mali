"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { AmountInput, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { counterpartyForm } from "@/hooks/use-commercial";
import type { Counterparty, CounterpartyForm } from "@/lib/commercial";

const fields = [
  ["code", "کد طرف‌حساب", 100],
  ["name", "نام", 200],
  ["national_id", "شناسه ملی", 20],
  ["economic_code", "کد اقتصادی", 20],
  ["phone", "تلفن", 50],
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
  return (
    <Drawer open onOpenChange={onClose} title={row ? (readOnly ? "پرونده طرف‌حساب" : "ویرایش طرف‌حساب") : "طرف‌حساب جدید"}>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map(([key, label, maxLength]) => (
            <Field key={key} id={`party-${key}`} label={label}>
              <Input id={`party-${key}`} value={form[key]} maxLength={maxLength}
                required={key === "name" || key === "code"} readOnly={readOnly}
                onChange={(event) => update(key, event.target.value)} />
            </Field>
          ))}
          <Field id="party-credit" label="سقف اعتبار (ریال)">
            <AmountInput id="party-credit" value={form.credit_limit_irr} maxLength={80}
              readOnly={readOnly} onValueChange={(value) => update("credit_limit_irr", value)} />
          </Field>
        </div>
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
        {!readOnly && <Button type="submit" busy={busy} disabled={!form.code.trim() || !form.name.trim()}>ذخیره</Button>}
      </form>
    </Drawer>
  );
}
