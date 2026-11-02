"use client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Field, FormMessage } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { CursorPagination } from "@/components/ui/pagination";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/content-states";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import { TruncatedText } from "@/components/ui/tooltip";
import type { useOperationLearning } from "@/hooks/use-operation-learning";
import { persian } from "@/lib/utils";
import { OperationCorrectionLearning } from "./operation-correction-learning";

type Controller = ReturnType<typeof useOperationLearning>;
export function OperationLearningPanel({ c }: { c: Controller }) {
  if (!c.available) return null;
  return (
    <section
      className="space-y-4 rounded-panel border border-border p-4"
      aria-label="پیشنهاد حساب از ثبت‌های تأییدشده"
    >
      <h3 className="font-medium">پیشنهاد حساب از ثبت‌های تأییدشده</h3>
      {c.resource.loading ? (
        <LoadingState label="در حال بررسی حساب‌های پیشین" />
      ) : c.resource.error ? (
        <ErrorState
          message={c.resource.error.message}
          onRetry={c.resource.refresh}
        />
      ) : !c.rows.length ? (
        <EmptyState
          compact
          title="پیشنهاد حسابی از عملیات ثبت‌شده موجود نیست"
        />
      ) : (
        <SuggestionTable c={c} />
      )}
      <CursorPagination {...c.resource} />
      <OperationCorrectionLearning c={c} />
      {!c.editor && <FormMessage error>{c.command.error?.message}</FormMessage>}
      <SuggestionEditor c={c} />
    </section>
  );
}
function SuggestionTable({ c }: { c: Controller }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>الگو</TableHead>
          <TableHead>حساب‌ها</TableHead>
          <TableHead>سند مرجع</TableHead>
          <TableHead>عملیات</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {c.rows.map((item) => (
          <TableRow key={item.operation_id}>
            <TableRowHeader>
              <p className="mb-2">{item.name}</p>
              <Badge tone={item.enabled ? "success" : "neutral"}>
                {item.enabled ? "فعال" : "غیرفعال"}
              </Badge>
              {item.learning_basis === "human_corrected_accounts" && (
                <p className="mt-2 text-xs text-muted">از اصلاح تأییدشده</p>
              )}
            </TableRowHeader>
            <TableCell>
              <ul className="space-y-2">
                {item.accountRows.map((account) => (
                  <li key={account.role}>
                    {account.label}: <span dir="ltr">{account.code}</span> ·{" "}
                    {account.name}
                  </li>
                ))}
              </ul>
            </TableCell>
            <TableCell>
              <p>
                سند {persian(item.journal_sequence)} · نسخه{" "}
                {persian(item.approved_draft_version)}
              </p>
              <TruncatedText className="block max-w-40 font-mono text-xs">
                {item.journal_digest}
              </TruncatedText>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!item.enabled || c.command.busy}
                  onClick={() => c.applySuggestion(item)}
                >
                  استفاده از پیشنهاد
                </Button>
                {c.canManage && (
                  <Button
                    variant="secondary"
                    disabled={c.command.busy}
                    onClick={() => c.edit(item)}
                  >
                    مدیریت پیشنهاد
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
function SuggestionEditor({ c }: { c: Controller }) {
  return (
    <Dialog
      title="مدیریت پیشنهاد حساب"
      open={!!c.editor}
      onOpenChange={(open) => {
        if (!open && !c.command.busy) c.close();
      }}
    >
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          c.save();
        }}
        fieldErrors={c.command.error?.fields}
      >
        <Field id="op-learning-name" label="نام پیشنهاد">
          <Input
            id="op-learning-name"
            required
            maxLength={120}
            value={c.editor?.name || ""}
            disabled={c.command.busy}
            onChange={(event) => c.changeEditor({ name: event.target.value })}
          />
        </Field>
        <Switch
          label="پیشنهاد فعال"
          checked={c.editor?.enabled || false}
          disabled={c.command.busy}
          onCheckedChange={(enabled) => c.changeEditor({ enabled })}
        />
        <FormMessage error>{c.command.error?.message}</FormMessage>
        <Button
          type="submit"
          busy={c.command.busy}
          disabled={!c.editor?.name.trim()}
        >
          ذخیره پیشنهاد
        </Button>
      </Form>
    </Dialog>
  );
}
