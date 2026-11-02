"use client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Field, FormMessage } from "@/components/ui/field";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import type { useCollectionReminder } from "@/hooks/use-collection-reminder";
export function CollectionReminderDialog({
  c,
}: {
  c: ReturnType<typeof useCollectionReminder>;
}) {
  return (
    <Dialog
      title="پیش‌نویس یادآوری پرداخت"
      open={!!c.current}
      onOpenChange={(open) => {
        if (!open) c.close();
      }}
    >
      {c.command.busy && !c.current?.draft ? (
        <LoadingState label="در حال بررسی مانده فاکتور" />
      ) : !c.current?.draft && c.command.error ? (
        <ErrorState message={c.command.error.message} />
      ) : c.current?.draft ? (
        <div className="space-y-4">
          <Field id="collection-reminder-text" label="متن قابل ویرایش">
            <Textarea
              id="collection-reminder-text"
              value={c.current.text}
              rows={7}
              maxLength={3000}
              disabled={c.command.busy}
              onChange={(event) => c.change(event.target.value)}
            />
          </Field>
          <FormMessage error>
            {c.feedback.error || c.command.error?.message}
          </FormMessage>
          {c.feedback.copied && <FormMessage>متن کپی شد.</FormMessage>}
          <Button
            busy={c.command.busy}
            disabled={!c.current.text.trim()}
            onClick={() => void c.copy()}
          >
            کپی متن
          </Button>
        </div>
      ) : null}
    </Dialog>
  );
}
