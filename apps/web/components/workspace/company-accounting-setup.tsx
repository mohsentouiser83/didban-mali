"use client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import {
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import {
  useCompanyAccountingSetup,
  type Setup,
} from "@/hooks/use-accounting-setup";
import { Panel } from "./page-parts";
export function CompanyAccountingSetup() {
  const c = useCompanyAccountingSetup();
  return (
    <Panel title="کاربرد حسابداری شرکت">
      {c.resource.loading ? (
        <LoadingState label="در حال دریافت تنظیم حسابداری" />
      ) : c.resource.error ? (
        <ErrorState
          message={c.resource.error.message}
          onRetry={c.resource.refresh}
        />
      ) : (
        <Form
          fieldErrors={c.command.error?.fields}
          onSubmit={(event) => {
            event.preventDefault();
            void c.save();
          }}
        >
          <Field id="company-accounting-mode" label="کاربرد دیدبان">
            <Select
              id="company-accounting-mode"
              value={c.mode}
              onValueChange={(mode) => c.setMode(mode as Setup["mode"])}
              disabled={!c.resource.data?.can_manage || c.command.busy}
              options={[
                { value: "analysis", label: "تحلیل و کنترل نرم‌افزار موجود" },
                { value: "primary", label: "حسابداری اصلی شرکت" },
              ]}
            />
          </Field>
          <StatusMessage>{c.postingStatus}</StatusMessage>
          <FormMessage error>{c.command.error?.message}</FormMessage>
          {c.resource.data?.can_manage && (
            <Button type="submit" busy={c.command.busy}>
              ذخیره کاربرد
            </Button>
          )}
        </Form>
      )}
    </Panel>
  );
}
