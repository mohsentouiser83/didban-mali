"use client";
import { useAccountRoleField } from "@/hooks/use-account-roles";
import { Select } from "@/components/ui/select";
import { Field, FormMessage } from "@/components/ui/field";
import { ErrorState, LoadingState } from "@/components/ui/content-states";

export function AccountRoleField({ accountId }: { accountId: string }) {
  const view = useAccountRoleField(accountId);
  const row = view.row;
  if (view.resource.loading)
    return <LoadingState label="در حال دریافت نقش حساب" />;
  if (view.resource.error)
    return (
      <ErrorState
        message={view.resource.error.message}
        onRetry={view.resource.refresh}
      />
    );
  return row ? (
    <Field id="account-financial-role" label="نقش مالی (ذخیره فوری)">
      <Select
        id="account-financial-role"
        value={row.role || "unassigned"}
        options={view.options}
        disabled={!view.editable || view.command.busy}
        onValueChange={(role) => view.save(row, role)}
      />
      <FormMessage error>{view.command.error?.message}</FormMessage>
    </Field>
  ) : null;
}
