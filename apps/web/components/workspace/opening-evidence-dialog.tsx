"use client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Textarea } from "@/components/ui/input";
import type { useOpeningEvidence } from "@/hooks/use-opening-evidence";
export function OpeningEvidenceDialog({
  c,
}: {
  c: ReturnType<typeof useOpeningEvidence>;
}) {
  const kind = c.target?.kind;
  return (
    <Dialog
      title={
        kind === "zero"
          ? "اعلام مانده اولیه صفر"
          : kind === "journal"
            ? "تعیین سند افتتاحیه"
            : "لغو مبنای صفر"
      }
      open={!!c.target}
      onOpenChange={(open) => {
        if (!open) c.close();
      }}
    >
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          c.save();
        }}
      >
        <Checkbox
          label={
            kind === "zero"
              ? "مانده همه حساب‌ها در ابتدای این دوره صفر بوده است."
              : kind === "journal"
                ? "این سند، مانده‌های ابتدای دوره را ثبت می‌کند."
                : "اعلام قبلی صفر را با حفظ سابقه لغو می‌کنم."
          }
          checked={c.ack}
          onCheckedChange={c.setAck}
        />
        <Field id="opening-evidence-reason" label="دلیل و مبنا">
          <Textarea
            id="opening-evidence-reason"
            required
            maxLength={1000}
            value={c.reason}
            onChange={(event) => c.setReason(event.target.value)}
          />
        </Field>
        <FormMessage error>{c.command.error?.message}</FormMessage>
        <Button
          type="submit"
          busy={c.command.busy}
          disabled={!c.ack || !c.reason.trim()}
        >
          ثبت تأیید صریح
        </Button>
      </Form>
    </Dialog>
  );
}
