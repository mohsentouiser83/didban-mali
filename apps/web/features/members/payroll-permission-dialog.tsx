"use client";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api, message } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/select";
import { Field, Textarea, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { notify } from "@/components/ui/sonner";
import type { Member } from "./member-view";

export function PayrollPermissionDialog({
  company,
  member,
  onClose,
}: {
  company: string;
  member: Member;
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const path = `/api/v1/companies/${company}/memberships/${member.id}/payroll-permissions`;
  const query = useQuery({
    queryKey: ["payroll-permission", company, member.id],
    queryFn: ({ signal }) =>
      api.get<Schema<"PayrollPermissions">>(path, signal),
  });
  const save = useCommand<
    { body: Schema<"PayrollPermissionsRequest">; version: number },
    Schema<"PayrollPermissions">
  >(
    ({ body, version }, key) => api.mutate(path, "PUT", body, key, version),
    async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["payroll-permission", company] }),
        cache.invalidateQueries({ queryKey: ["payroll-access", company] }),
        cache.invalidateQueries({ queryKey: ["extension-events", company] }),
      ]);
      notify.success("مجوزهای حقوق ثبت شدند.");
      onClose();
    },
  );
  return (
    <Dialog
      open
      busy={save.isPending}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="مجوزهای حقوق‌ودستمزد"
      description={member.display_name}
      icon="ShieldCheck"
    >
      {query.isPending ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState
          message={message(query.error)}
          onRetry={() => query.refetch()}
        />
      ) : (
        <PayrollPermissionForm
          key={query.data.version}
          permission={query.data}
          busy={save.isPending}
          error={save.error ? message(save.error) : undefined}
          onRefresh={() => {
            save.reset();
            void query.refetch();
          }}
          onSubmit={(body) =>
            save.mutate({ body, version: query.data.version })
          }
        />
      )}
    </Dialog>
  );
}
function PayrollPermissionForm({
  permission,
  busy,
  error,
  onSubmit,
  onRefresh,
}: {
  permission: Schema<"PayrollPermissions">;
  busy: boolean;
  error?: string;
  onSubmit: (body: Schema<"PayrollPermissionsRequest">) => void;
  onRefresh: () => void;
}) {
  const [values, setValues] = useState({
    view: permission.view,
    manage: permission.manage,
    approve: permission.approve,
  });
  const labels = {
    view: "مشاهده اطلاعات و فیش‌ها",
    manage: "مدیریت اطلاعات و محاسبه",
    approve: "تأیید نهایی حقوق",
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({ ...values, reason: String(data.get("reason")).trim() });
  };
  return (
    <Form className="space-y-5" onSubmit={submit}>
      {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
        <div className="flex items-center justify-between gap-3" key={key}>
          <label htmlFor={`payroll-permission-${key}`}>{labels[key]}</label>
          <Switch
            id={`payroll-permission-${key}`}
            label={labels[key]}
            checked={values[key]}
            disabled={busy}
            onCheckedChange={(checked) =>
              setValues((v) => ({ ...v, [key]: checked }))
            }
          />
        </div>
      ))}
      <Field id="payroll-permission-reason" label="دلیل تغییر">
        <Textarea
          id="payroll-permission-reason"
          name="reason"
          required
          maxLength={4000}
          disabled={busy}
        />
      </Field>
      <FormMessage>{error}</FormMessage>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "در حال ثبت…" : "ثبت مجوزها"}
        </Button>
        {error ? (
          <Button variant="secondary" onClick={onRefresh}>
            دریافت نسخه تازه
          </Button>
        ) : null}
      </div>
    </Form>
  );
}
