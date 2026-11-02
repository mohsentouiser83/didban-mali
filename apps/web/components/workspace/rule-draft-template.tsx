"use client";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import {
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import type { AutomationController } from "@/hooks/use-automation-rules";

export function RuleDraftTemplate({ c }: { c: AutomationController }) {
  const template = c.local.definition.draft_template;
  if (!template) return null;
  return (
    <div className="space-y-4 rounded-panel border border-border p-4">
      <Field id="rule-template-kind" label="الگوی خدمات">
        <Select
          id="rule-template-kind"
          value={template.kind}
          disabled={c.command.busy}
          onValueChange={(kind) => c.changeTemplate(kind as typeof template.kind)}
          options={[
            { value: "sale_service", label: "فروش نسیه خدمات" },
            { value: "purchase_service", label: "خرید نسیه خدمات" },
          ]}
        />
      </Field>
      {c.accounts.loading ? (
        <LoadingState label="در حال دریافت حساب‌ها" />
      ) : c.accounts.error ? (
        <ErrorState
          message={c.accounts.error.message}
          onRetry={c.accounts.refresh}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {c.templateRoles.map((role) => (
              <Field
                key={role.key}
                id={`rule-template-${role.key}`}
                label={role.label}
              >
                <Select
                  id={`rule-template-${role.key}`}
                  value={template.accounts[role.key] || ""}
                  disabled={c.command.busy}
                  onValueChange={(id) => c.changeTemplateAccount(role.key, id)}
                  options={c.accountOptions}
                />
              </Field>
            ))}
          </div>
        </>
      )}
      <StatusMessage>
        فقط فاکتور خدمات با مالیات صفرِ مشخص؛ پیش‌نویس پس از بررسی، جداگانه تأیید
        می‌شود.
      </StatusMessage>
    </div>
  );
}
