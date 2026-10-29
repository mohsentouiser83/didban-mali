"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Schema } from "@didban/api-client";
import { PageHeader } from "@/features/companies/company-view";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Field, Textarea, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";

type Values = Schema<"CompanyModuleValues">;
const labels: Record<keyof Values, string> = {
  accounting: "تحلیل حسابداری",
  cash: "نقد و بانک",
  balances: "مطالبات و بدهی‌ها",
  invoices: "خرید و فروش",
  settlements: "تسویه و تعهدات",
  moadian: "مؤدیان",
  forecast: "پیش‌بینی نقد",
  payroll: "حقوق‌ودستمزد",
};
export function ModuleView({
  companyName,
  state,
  canManage,
  busy,
  error,
  onSubmit,
  onRefresh,
}: {
  companyName: string;
  state: Schema<"CompanyModules">;
  canManage: boolean;
  busy: boolean;
  error?: string;
  onRefresh: () => void;
  onSubmit: (modules: Values, reason: string) => void;
}) {
  const [values, setValues] = useState<Values>(state.modules);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const saveButton = useRef<HTMLButtonElement>(null);
  const returnAfterRequest = useRef(false);
  const previouslyBusy = useRef(false);
  useEffect(() => {
    if (previouslyBusy.current && !busy && returnAfterRequest.current) {
      returnAfterRequest.current = false;
      saveButton.current?.focus();
    }
    previouslyBusy.current = busy;
  }, [busy]);
  const disabling = Object.keys(values).some(
    (k) => state.modules[k as keyof Values] && !values[k as keyof Values],
  );
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (disabling) setConfirm(true);
    else onSubmit(values, reason.trim());
  };
  return (
    <section className="motion-safe:animate-reveal">
      <PageHeader
        icon="Layers3"
        title="ماژول‌های شرکت"
        description={companyName}
      />
      <Form onSubmit={submit} className="max-w-3xl space-y-5">
        <div className="rounded-panel border border-border bg-surface p-5 shadow-panel sm:p-7">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
            <h2 className="font-medium">هستهٔ مشترک</h2>
            <Badge tone="success">همیشه فعال</Badge>
          </div>
          <div className="divide-y divide-border">
            {(Object.keys(labels) as (keyof Values)[]).map((name) => (
              <div
                key={name}
                className="flex min-h-16 items-center justify-between gap-4 py-3"
              >
                <label htmlFor={`module-${name}`} className="font-medium">
                  {labels[name]}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">
                    {values[name] ? "فعال" : "غیرفعال"}
                  </span>
                  <Switch
                    id={`module-${name}`}
                    label={labels[name]}
                    checked={values[name]}
                    disabled={!canManage || busy}
                    onCheckedChange={(checked) =>
                      setValues((v) => ({ ...v, [name]: checked }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        {canManage ? (
          <>
            <Field id="module-change-reason" label="دلیل تغییر">
              <Textarea
                id="module-change-reason"
                required
                maxLength={4000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
              />
            </Field>
            <FormMessage>{error}</FormMessage>
            <div className="flex flex-wrap gap-3">
              <Button ref={saveButton} type="submit" disabled={busy}>
                {busy ? "در حال ثبت…" : "ذخیره ماژول‌ها"}
              </Button>
              {error ? (
                <Button variant="secondary" onClick={onRefresh}>
                  دریافت نسخه تازه
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </Form>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="ماژول‌های انتخاب‌شده غیرفعال شوند؟"
        description="عملیات جدید متوقف می‌شود؛ اطلاعات و گزارش‌های قبلی حفظ می‌شوند."
        busy={busy}
        onConfirm={() => {
          returnAfterRequest.current = true;
          setConfirm(false);
          onSubmit(values, reason.trim());
        }}
      />
    </section>
  );
}
