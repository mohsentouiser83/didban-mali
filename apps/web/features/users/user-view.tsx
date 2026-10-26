"use client";
import type { FormEvent } from "react";
import type { Schema } from "@didban/api-client";
import { Plus, KeyRound, UserRound } from "lucide-react";
import { PageHeader } from "@/features/companies/company-view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableRowHeader,
  TableCell,
} from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Field, Input, FormMessage, Textarea } from "@/components/ui/field";
export function UserListView({
  users,
  onInvite,
  onReset,
  more,
  busy,
  onMore,
}: {
  users: Schema<"DirectoryUser">[];
  onInvite: () => void;
  onReset: (u: Schema<"DirectoryUser">) => void;
  more: boolean;
  busy: boolean;
  onMore: () => void;
}) {
  return (
    <section className="motion-safe:animate-reveal">
      <PageHeader
        title="کاربران سازمان"
        action={
          <Button onClick={onInvite}>
            <Plus size={18} aria-hidden />
            دعوت کاربر
          </Button>
        }
      />
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>کاربر</TableHead>
              <TableHead>دسترسی سازمانی</TableHead>
              <TableHead>وضعیت حساب</TableHead>
              <TableHead>عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableRowHeader>
                  <p>{u.display_name}</p>
                  <p
                    dir="ltr"
                    className="mt-1 w-fit text-xs font-normal text-muted"
                  >
                    {u.email}
                  </p>
                </TableRowHeader>
                <TableCell>
                  {u.is_installation_admin ? "مدیر نصب" : "کاربر سازمان"}
                </TableCell>
                <TableCell>
                  <UserStatus user={u} />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    disabled={u.disabled}
                    onClick={() => onReset(u)}
                  >
                    <KeyRound size={16} aria-hidden />
                    {u.activated ? "کد بازیابی رمز" : "دعوت دوباره"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-4 md:hidden">
        {users.map((u) => (
          <article
            key={u.id}
            className="rounded-panel border border-border bg-surface p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-medium [overflow-wrap:anywhere]">
                  {u.display_name}
                </h2>
                <p dir="ltr" className="mt-1 break-all text-xs text-muted">
                  {u.email}
                </p>
              </div>
              <UserStatus user={u} />
            </div>
            <p className="my-3 text-xs text-muted">
              {u.is_installation_admin ? "مدیر نصب" : "کاربر سازمان"}
            </p>
            <Button
              variant="ghost"
              disabled={u.disabled}
              onClick={() => onReset(u)}
            >
              <KeyRound size={16} aria-hidden />
              {u.activated ? "کد بازیابی رمز" : "دعوت دوباره"}
            </Button>
          </article>
        ))}
      </div>
      {more ? (
        <div className="mt-5 text-center">
          <Button variant="secondary" disabled={busy} onClick={onMore}>
            {busy ? "در حال دریافت…" : "کاربران بیشتر"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
function UserStatus({ user }: { user: Schema<"DirectoryUser"> }) {
  return (
    <Badge
      tone={user.disabled ? "neutral" : user.activated ? "success" : "warning"}
    >
      {user.disabled
        ? "غیرفعال"
        : user.activated
          ? "فعال"
          : "در انتظار فعال‌سازی"}
    </Badge>
  );
}
export function InviteUserDialog({
  open,
  onOpenChange,
  busy,
  error,
  onSubmit,
  token,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  busy: boolean;
  error?: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  token?: Schema<"ManualToken">;
}) {
  return (
    <Dialog
      busy={busy}
      open={open}
      onOpenChange={onOpenChange}
      title={token ? "دعوت آماده است" : "دعوت کاربر"}
    >
      {token ? (
        <TokenReceipt token={token} label="کد دعوت" />
      ) : (
        <Form className="space-y-5" onSubmit={onSubmit}>
          <Field id="invite-name" label="نام و نام خانوادگی">
            <Input
              id="invite-name"
              name="display_name"
              required
              maxLength={4000}
              autoComplete="off"
            />
          </Field>
          <Field id="invite-email" label="ایمیل">
            <Input
              id="invite-email"
              name="email"
              dir="ltr"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
            />
          </Field>
          <FormMessage>{error}</FormMessage>
          <Button type="submit" className="w-full" disabled={busy}>
            <UserRound size={17} aria-hidden />
            {busy ? "در حال ایجاد…" : "ایجاد دعوت"}
          </Button>
        </Form>
      )}
    </Dialog>
  );
}
export function TokenReceipt({
  token,
  label,
}: {
  token: Schema<"ManualToken">;
  label: string;
}) {
  return (
    <div className="space-y-4">
      <Field id="manual-token" label={label}>
        <Textarea
          id="manual-token"
          dir="ltr"
          value={token.token}
          readOnly
          autoComplete="off"
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
        />
      </Field>
      <p className="text-sm text-muted">
        کد را به‌صورت خصوصی تحویل کاربر دهید. ارسال خودکار انجام نمی‌شود.
      </p>
      <p className="text-xs text-muted">
        اعتبار تا{" "}
        {new Intl.DateTimeFormat("fa-IR", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Asia/Tehran",
        }).format(new Date(token.expires_at))}
      </p>
    </div>
  );
}
export function ResetUserDialog({
  user,
  onClose,
  onReset,
  busy,
  error,
  token,
}: {
  user: Schema<"DirectoryUser">;
  onClose: () => void;
  onReset: () => void;
  busy: boolean;
  error?: string;
  token?: Schema<"ManualToken">;
}) {
  return (
    <Dialog
      busy={busy}
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={user.activated ? "بازیابی رمز عبور" : "دعوت دوباره"}
      description={user.display_name}
    >
      {token ? (
        <TokenReceipt
          token={token}
          label={user.activated ? "کد بازیابی" : "کد دعوت"}
        />
      ) : (
        <div className="space-y-5">
          <p className="text-muted">
            {user.activated
              ? "با ثبت رمز جدید، همه نشست‌های قبلی کاربر بسته می‌شوند."
              : "کد دعوت قبلی با صدور کد جدید باطل می‌شود."}
          </p>
          <FormMessage>{error}</FormMessage>
          <Button className="w-full" onClick={onReset} disabled={busy}>
            {busy
              ? "در حال ایجاد…"
              : user.activated
                ? "ایجاد کد بازیابی"
                : "ایجاد کد دعوت"}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
