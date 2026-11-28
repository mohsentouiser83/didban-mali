"use client";

import { XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

export function AccountDetailTargets({
  options, targets, disabled, onAdd, onRemove,
}: {
  options: { value: string; label: string }[];
  targets: { id: string; label: string }[];
  disabled: boolean;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Field id="ledger-detail-target" name="linked_account_ids" label="حساب‌های پیوندی">
      <div className="space-y-2">
        {targets.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {targets.map(({ id, label }) => (
              <li key={id} className="flex items-center gap-1 rounded-control border border-border px-2 text-sm">
                <span>{label}</span>
                <Button
                  variant="ghost"
                  className="size-8 min-h-0 rounded-md p-0"
                  aria-label={`برداشتن پیوند ${label}`}
                  disabled={disabled}
                  onClick={() => onRemove(id)}
                >
                  <XIcon size={15} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Select
          id="ledger-detail-target"
          label="حساب‌های پیوندی"
          value=""
          placeholder="انتخاب حساب گروه، کل یا معین"
          options={options}
          searchable
          disabled={disabled || options.length === 0}
          onValueChange={onAdd}
        />
      </div>
    </Field>
  );
}
