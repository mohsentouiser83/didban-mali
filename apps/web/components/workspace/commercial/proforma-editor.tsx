"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { AmountInput, Input, Textarea } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { SearchSelect } from "@/components/ui/search-select";
import { Select, type SelectOption } from "@/components/ui/select";
import { emptyProformaLine, proformaForm } from "@/hooks/use-commercial";
import type { Counterparty, Proforma, ProformaForm, ProformaLineForm } from "@/lib/commercial";
import { amount, asciiDigits, persian } from "@/lib/utils";
import { CounterpartyQuickDrawer } from "./counterparty-profile-drawer";

function parseBigIntDigits(raw: string): bigint {
  const digits = asciiDigits(raw || "").replace(/[^\d]/g, "");
  if (!digits) return BigInt(0);
  try {
    return BigInt(digits);
  } catch {
    return BigInt(0);
  }
}

export function ProformaEditor({ row, busy, error, partyQuery, partyOptions, partyError, itemOptions,
  canManageParties, onPartyCreated, onPartySearch, onClose, onSave }: {
  row?: Proforma;
  busy: boolean;
  error?: string;
  partyQuery: string;
  partyOptions: SelectOption[];
  partyError?: string;
  itemOptions: SelectOption[];
  canManageParties?: boolean;
  onPartyCreated?: (created: Counterparty) => void;
  onPartySearch: (value: string) => void;
  onClose: () => void;
  onSave: (form: ProformaForm) => void;
}) {
  const [form, setForm] = useState(() => proformaForm(row));
  const [partyLabel, setPartyLabel] = useState(row?.party_id ?? "");
  const [nextKey, setNextKey] = useState(form.lines.length);
  const [quickPartyMode, setQuickPartyMode] = useState<"list" | "create" | null>(null);
  function update<K extends keyof ProformaForm>(key: K, value: ProformaForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  function changeLine(line: ProformaLineForm) {
    setForm((previous) => ({
      ...previous, lines: previous.lines.map((current) => current.key === line.key ? line : current),
    }));
  }
  const lineSubtotal = form.lines.reduce((sum, line) => {
    const qty = parseBigIntDigits(line.quantity || "0");
    const price = parseBigIntDigits(line.unit_price || "0");
    const disc = parseBigIntDigits(line.discount || "0");
    const gross = qty * price;
    return sum + (gross > disc ? gross - disc : BigInt(0));
  }, BigInt(0));
  const invDisc = parseBigIntDigits(form.invoice_discount || "0");
  const netTotal = lineSubtotal > invDisc ? lineSubtotal - invDisc : BigInt(0);
  const valid = !!(form.party_id.trim() && form.date) &&
    (!form.expiry_date || form.expiry_date >= form.date) &&
    invDisc <= lineSubtotal &&
    form.lines.every((line) => line.description.trim() && /^[1-9]\d{0,9}$/.test(line.quantity)
      && Number(line.quantity) <= 1_000_000_000 && /^\d+(\.\d+)?$/.test(line.unit_price) && /[1-9]/.test(line.unit_price)
      && (!line.discount || /^\d+(\.\d+)?$/.test(line.discount)));
  return (
    <Drawer open onOpenChange={onClose} className="max-w-3xl"
      title={row ? "ویرایش پیش‌فاکتور" : "پیش‌فاکتور جدید"}>
      <form className="space-y-5" onSubmit={(event) => {
        event.preventDefault();
        if (valid) onSave(form);
      }}>
        <div className="grid gap-4 sm:grid-cols-2">
          
          <Field id="proforma-date" label="تاریخ صدور" required>
            <PersianDatePicker id="proforma-date" value={form.date} onChange={(value) => update("date", value)} />
          </Field>
          <Field id="proforma-expiry" label="اعتبار تا" error={form.expiry_date && form.expiry_date < form.date ? "تاریخ اعتبار باید از تاریخ صدور زودتر نباشد." : undefined}>
            <PersianDatePicker id="proforma-expiry" value={form.expiry_date} onChange={(value) => update("expiry_date", value)} />
          </Field>
          <div className="space-y-1.5">
            <Field id="proforma-party" label="طرف‌حساب" required>
              <SearchSelect id="proforma-party" value={form.party_id} selectedLabel={partyLabel}
                query={partyQuery} onQueryChange={onPartySearch} options={partyOptions}
                error={partyError} searchLabel="جست‌وجوی نام طرف‌حساب"
                onValueChange={(value, label) => { update("party_id", value); setPartyLabel(label); }} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" className="min-h-8 px-2 text-xs" onClick={() => setQuickPartyMode("list")}>
                مشاهده پرونده طرف‌حساب‌ها
              </Button>
              {canManageParties && (
                <Button variant="ghost" className="min-h-8 px-2 text-xs" onClick={() => setQuickPartyMode("create")}>
                  تعریف طرف‌حساب جدید
                </Button>
              )}
            </div>
          </div>

        </div>
        <div className="space-y-3">
          {form.lines.map((line, index) => (
            <ProformaLineFields key={line.key} line={line} index={index} itemOptions={itemOptions}
              onChange={changeLine} onRemove={form.lines.length > 1 ? () =>
                update("lines", form.lines.filter((current) => current.key !== line.key)) : undefined} />
          ))}
          <Button variant="secondary" disabled={form.lines.length >= 100} onClick={() => {
            update("lines", [...form.lines, emptyProformaLine(nextKey)]);
            setNextKey((key) => key + 1);
          }}>افزودن ردیف</Button>
        </div>
        <Field id="proforma-invoice-discount" label="تخفیف کل پیش‌فاکتور (ریال)">
          <AmountInput id="proforma-invoice-discount" value={form.invoice_discount} maxLength={80}
            onValueChange={(value) => update("invoice_discount", value)} />
        </Field>
        <Field id="proforma-terms" label="شرایط">
          <Textarea id="proforma-terms" value={form.terms} maxLength={1000}
            onChange={(event) => update("terms", event.target.value)} />
        </Field>
        <div className="grid gap-3 rounded-xl border border-border bg-canvas/60 p-3 text-sm sm:grid-cols-3" aria-live="polite">
          <div>
            <span className="text-xs text-muted">جمع ردیف‌ها: </span>
            <span className="font-medium tabular-nums">{amount(lineSubtotal.toString())} ریال</span>
          </div>
          <div>
            <span className="text-xs text-muted">تخفیف کل: </span>
            <span className="font-medium tabular-nums">{amount(invDisc.toString())} ریال</span>
          </div>
          <div>
            <span className="text-xs text-muted">خالص پیش‌فاکتور: </span>
            <span className="font-semibold text-primary tabular-nums">{amount(netTotal.toString())} ریال</span>
          </div>
        </div>
        <FormMessage error>{error || (invDisc > lineSubtotal ? "تخفیف کل نمی‌تواند از جمع ردیف‌ها بیشتر باشد." : undefined)}</FormMessage>
        <Button type="submit" busy={busy} disabled={!valid}>{row ? "ذخیره" : "صدور پیش‌فاکتور"}</Button>
      </form>
      {quickPartyMode && (
        <CounterpartyQuickDrawer
          open
          initialMode={quickPartyMode}
          onOpenChange={(open) => { if (!open) setQuickPartyMode(null); }}
          onCreated={(created) => {
            update("party_id", created.code);
            setPartyLabel(`${created.name} · ${created.code}`);
            onPartyCreated?.(created);
          }}
        />
      )}
    </Drawer>
  );
}

function ProformaLineFields({ line, index, itemOptions, onChange, onRemove }: {
  line: ProformaLineForm;
  index: number;
  itemOptions: SelectOption[];
  onChange: (line: ProformaLineForm) => void;
  onRemove?: () => void;
}) {
  const id = `proforma-line-${line.key}`;
  const options = [
    { value: "none", label: "بدون کالای انباری" },
    ...itemOptions,
    ...(line.item_id && !itemOptions.some((item) => item.value === line.item_id)
      ? [{ value: line.item_id, label: "کالای ثبت‌شده در پیش‌فاکتور" }] : []),
  ];
  return (
    <fieldset className="min-w-0 space-y-3 rounded-panel border border-border p-3">
      <legend className="px-2 text-sm font-medium">ردیف {persian(index + 1)}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-item`} label="کالا">
          <Select id={`${id}-item`} value={line.item_id || "none"} options={options}
            onValueChange={(value) => onChange({ ...line, item_id: value === "none" ? "" : value })} />
        </Field>
        <Field id={`${id}-description`} label="شرح">
          <Input id={`${id}-description`} value={line.description} required maxLength={300}
            onChange={(event) => onChange({ ...line, description: event.target.value })} />
        </Field>
        <Field id={`${id}-quantity`} label="تعداد">
          <Input id={`${id}-quantity`} inputMode="numeric" value={persian(line.quantity)} required maxLength={10}
            onChange={(event) => onChange({ ...line, quantity: asciiDigits(event.target.value) })} />
        </Field>
        <Field id={`${id}-price`} label="بهای واحد (ریال)">
          <AmountInput id={`${id}-price`} value={line.unit_price} required maxLength={80}
            onValueChange={(value) => onChange({ ...line, unit_price: value })} />
        </Field>
        <Field id={`${id}-discount`} label="تخفیف کل ردیف (ریال)">
          <AmountInput id={`${id}-discount`} value={line.discount} maxLength={80}
            onValueChange={(value) => onChange({ ...line, discount: value })} />
        </Field>
      </div>
      {onRemove && <Button variant="ghost" aria-label={`حذف ردیف ${persian(index + 1)}`} onClick={onRemove}>حذف ردیف</Button>}
    </fieldset>
  );
}
