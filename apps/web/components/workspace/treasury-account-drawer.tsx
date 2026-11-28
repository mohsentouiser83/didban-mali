"use client";

import { useId } from "react";
import { BankIcon, CreditCardIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { DetailField, DetailGroup } from "@/components/ui/field-layout";
import { Form } from "@/components/ui/form";
import { AmountInput, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useTreasuryAccountEditor } from "@/hooks/use-treasury-account-management";
import { treasuryKindLabels, type TreasuryAccountItem, type TreasuryAccountKind } from "@/lib/treasury-documents";
import { amount } from "@/lib/utils";

const bankFields = [
  { key: "bank_name", label: "نام بانک", maxLength: 120 },
  { key: "account_number", label: "شماره حساب", maxLength: 60, dir: "ltr" },
  { key: "iban", label: "شماره شبا", maxLength: 34, dir: "ltr" },
  { key: "branch_name", label: "نام شعبه", maxLength: 120 },
  { key: "branch_code", label: "کد شعبه", maxLength: 30, dir: "ltr" },
] as const;

const kindOptions = Object.entries(treasuryKindLabels).map(([value, label]) => ({ value, label }));

interface TreasuryAccountDrawerProps {
  editing: TreasuryAccountItem | null;
  readOnly: boolean;
  bankOptions: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}

function TreasuryAccountDetails({ account }: { account: TreasuryAccountItem }) {
  return (
    <DetailGroup>
      <DetailField label="کد حساب" value={account.code || "—"} />
      <DetailField label="نوع حساب" value={treasuryKindLabels[account.kind]} />
      <DetailField label="وضعیت" value={account.active ? "فعال" : "غیرفعال"} />
      {account.kind === "bank" && bankFields.map(({ key, label }) => (
        <DetailField key={key} label={label} value={account[key] || "—"} icon={BankIcon} />
      ))}
      {account.kind === "petty_cash" && (
        <>
          <DetailField label="نام تنخواه‌دار" value={account.custodian_name || "—"} />
          <DetailField
            label="سقف ریالی تنخواه"
            value={account.petty_cash_limit_irr ? `${amount(account.petty_cash_limit_irr)} ریال` : "—"}
          />
        </>
      )}
      {account.kind === "pos" && (
        <DetailField label="حساب بانکی" value={account.linked_bank_name || "—"} icon={CreditCardIcon} />
      )}
    </DetailGroup>
  );
}

export function TreasuryAccountDrawer({ editing, readOnly, bankOptions, onClose, onSaved }: TreasuryAccountDrawerProps) {
  const formId = useId();
  const { kind, setKind, fields, change, save, command } = useTreasuryAccountEditor(editing, onSaved);
  const title = editing
    ? readOnly ? editing.name : `ویرایش ${editing.name}`
    : "تعریف حساب خزانه";

  return (
    <Drawer
      open
      onOpenChange={(open) => { if (!open && !command.busy) onClose(); }}
      title={title}
      footer={!readOnly && (
        <Button
          type="submit"
          form={formId}
          busy={command.busy}
          disabled={!fields.name.trim() || (kind === "pos" && !fields.linked_bank_id)}
        >
          {editing ? "ذخیره تغییرات" : "ثبت حساب"}
        </Button>
      )}
    >
      {readOnly && editing ? (
        <TreasuryAccountDetails account={editing} />
      ) : (
        <Form
          id={formId}
          fieldErrors={command.error?.fields}
          onSubmit={(event) => { event.preventDefault(); save(); }}
          className="space-y-4"
        >
          {!editing && (
            <Field id="treasury-kind" label="نوع حساب" required>
              <Select
                id="treasury-kind"
                value={kind}
                options={kindOptions}
                disabled={command.busy}
                onValueChange={(value) => { setKind(value as TreasuryAccountKind); command.clearError(); }}
              />
            </Field>
          )}
          <Field id="treasury-name" name="name" label={kind === "pos" ? "نام کارت‌خوان" : "نام حساب"} required>
            <Input
              id="treasury-name"
              required
              maxLength={150}
              value={fields.name}
              disabled={command.busy}
              onChange={(event) => change("name", event.target.value)}
            />
          </Field>
          {kind === "bank" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {bankFields.map((field) => (
                <Field key={field.key} id={`treasury-${field.key}`} name={field.key} label={field.label}>
                  <Input
                    id={`treasury-${field.key}`}
                    dir={"dir" in field ? field.dir : undefined}
                    maxLength={field.maxLength}
                    value={fields[field.key]}
                    disabled={command.busy}
                    onChange={(event) => change(field.key, event.target.value)}
                  />
                </Field>
              ))}
            </div>
          )}
          {kind === "petty_cash" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="treasury-holder" name="custodian_name" label="نام تنخواه‌دار">
                <Input
                  id="treasury-holder"
                  value={fields.custodian_name}
                  maxLength={120}
                  disabled={command.busy}
                  onChange={(event) => change("custodian_name", event.target.value)}
                />
              </Field>
              <Field id="treasury-petty-limit" name="petty_cash_limit_irr" label="سقف ریالی تنخواه">
                <AmountInput
                  id="treasury-petty-limit"
                  value={fields.petty_cash_limit_irr}
                  maxLength={80}
                  disabled={command.busy}
                  onValueChange={(value) => change("petty_cash_limit_irr", value)}
                />
              </Field>
            </div>
          )}
          {kind === "pos" && (
            <Field id="treasury-pos-bank" name="linked_bank_id" label="حساب بانکی" required>
              <Select
                id="treasury-pos-bank"
                value={fields.linked_bank_id}
                options={bankOptions}
                placeholder={bankOptions.length ? "انتخاب حساب بانکی" : "حساب بانکی فعالی تعریف نشده است"}
                disabled={command.busy || !bankOptions.length}
                searchable
                onValueChange={(value) => change("linked_bank_id", value)}
              />
            </Field>
          )}
          {editing && (
            <Checkbox
              id="treasury-active"
              label="فعال"
              checked={fields.active}
              disabled={command.busy}
              onCheckedChange={(value) => change("active", value)}
            />
          )}
          <FormMessage error>{command.error?.message}</FormMessage>
        </Form>
      )}
    </Drawer>
  );
}
