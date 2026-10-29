import { AppIcon } from "@/components/ui/app-icon";
import type { FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Field, Textarea, FormMessage } from "@/components/ui/field";
import { Select, type Option } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { CandidateModel } from "./presentation";

export function DecisionView({
  item,
  unit,
  onClose,
  canOperate,
  action,
  actions,
  onAction,
  reason,
  onReason,
  onSubmit,
  busy,
  error,
  success,
}: {
  item: CandidateModel;
  unit: string;
  onClose: () => void;
  canOperate: boolean;
  action: string;
  actions: Option[];
  onAction: (v: string) => void;
  reason: string;
  onReason: (v: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error: string | null;
  success: boolean;
}) {
  return (
    <Dialog
      icon="GitCompareArrows"
      open
      title="شواهد مقایسه"
      busy={busy}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge>{item.status}</Badge>
          <Badge>{item.decision}</Badge>
        </div>
        {item.reasons.map((r) => (
          <p key={r} className="text-xs text-muted">
            {r}
          </p>
        ))}
        <div className="grid gap-3">
          {item.sources.map((s) => (
            <section
              key={s.key}
              className="space-y-2 rounded-panel border border-border p-4"
            >
              <h3 className="font-medium">
                {s.side} · {s.sheet}
              </h3>
              <p className="text-xs text-muted">
                ردیف {s.row} · {s.date}
              </p>
              <p className="break-all">
                <bdi>{s.reference}</bdi>
              </p>
              <p className="tabular-nums">
                <bdi>{s.amount}</bdi> {unit}
              </p>
            </section>
          ))}
        </div>
        {item.chain.length ? (
          <section>
            <h3 className="flex items-center gap-2 mb-2 font-medium">
              <AppIcon name="GitCompareArrows" className="text-primary" />
              زنجیره مرجع
            </h3>
            <ol className="space-y-2">
              {item.chain.map((r, i) => (
                <li key={i} className="break-all text-xs">
                  {r.technical ? <bdi>{r.value}</bdi> : r.value}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {canOperate ? (
          <Form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="comparison-action"
                className="flex items-center gap-2 mb-2 block text-xs font-medium"
              >
                <AppIcon name="GitCompareArrows" className="text-primary" />
                تصمیم
              </label>
              <Select
                id="comparison-action"
                value={action}
                onValueChange={onAction}
                options={actions}
                label="تصمیم"
                disabled={busy}
              />
            </div>
            <Field icon="GitCompareArrows" label="دلیل" id="comparison-reason">
              <Textarea
                id="comparison-reason"
                required
                maxLength={4000}
                value={reason}
                onChange={(e) => onReason(e.target.value)}
                disabled={busy}
              />
            </Field>
            <FormMessage success={!error && success}>
              {error ?? (success ? "تصمیم ثبت شد." : null)}
            </FormMessage>
            <Button type="submit" disabled={busy}>
              <AppIcon name="Save" />
              {busy ? "در حال ثبت" : "ثبت تصمیم"}
            </Button>
          </Form>
        ) : null}
      </div>
    </Dialog>
  );
}
