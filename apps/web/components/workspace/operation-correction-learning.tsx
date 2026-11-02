"use client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CursorPagination } from "@/components/ui/pagination";
import { ErrorState, StatusMessage } from "@/components/ui/content-states";
import type { useOperationLearning } from "@/hooks/use-operation-learning";
import { persian } from "@/lib/utils";

type Controller = ReturnType<typeof useOperationLearning>;
export function OperationCorrectionLearning({ c }: { c: Controller }) {
  const current = c.correction;
  return (
    <>
      {c.corrections.error && (
        <ErrorState
          message={c.corrections.error.message}
          onRetry={c.corrections.refresh}
        />
      )}
      {!!c.corrections.data?.items.length && (
        <div className="space-y-3 border-t border-border pt-4">
          <h4 className="font-medium">اصلاح حساب‌های ثبت‌شده</h4>
          <div className="flex flex-wrap gap-2">
            {c.corrections.data.items.map((item) => (
              <Button
                key={item.operation_id}
                variant="secondary"
                disabled={c.command.busy}
                onClick={() => c.reviewCorrection(item)}
              >
                بررسی اصلاح سند {persian(item.journal_sequence)}
              </Button>
            ))}
          </div>
        </div>
      )}
      <CursorPagination {...c.corrections} />
      <Dialog
        title="یادگیری از اصلاح حساب‌ها"
        open={!!current}
        onOpenChange={(open) => {
          if (!open && !c.command.busy) c.closeCorrection();
        }}
      >
        {current && (
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              c.adoptCorrection();
            }}
            fieldErrors={c.command.error?.fields}
          >
            <StatusMessage>
              سند {persian(current.item.journal_sequence)} · نسخه تأییدشده{" "}
              {persian(current.item.approved_draft_version)}
            </StatusMessage>
            {current.item.roles.map((role) => (
              <Field
                key={role.key}
                id={`op-correct-${role.key}`}
                label={role.label}
              >
                <Select
                  id={`op-correct-${role.key}`}
                  value={current.accounts[role.key] || ""}
                  disabled={c.command.busy}
                  onValueChange={(account) =>
                    c.changeCorrection({
                      accounts: { ...current.accounts, [role.key]: account },
                    })
                  }
                  options={current.item.account_choices.map((account) => ({
                    value: account.id,
                    label: `${account.code} · ${account.name} · ${account.side === "debit" ? "بدهکار" : "بستانکار"}`,
                  }))}
                />
              </Field>
            ))}
            <Field id="op-correct-reason" label="دلیل تأیید اصلاح">
              <Textarea
                id="op-correct-reason"
                required
                maxLength={1000}
                value={current.reason}
                disabled={c.command.busy}
                onChange={(event) =>
                  c.changeCorrection({ reason: event.target.value })
                }
              />
            </Field>
            <FormMessage error>{c.command.error?.message}</FormMessage>
            <Button
              type="submit"
              busy={c.command.busy}
              disabled={!c.canAdoptCorrection}
            >
              ثبت برای پیشنهادهای بعدی
            </Button>
          </Form>
        )}
      </Dialog>
    </>
  );
}
