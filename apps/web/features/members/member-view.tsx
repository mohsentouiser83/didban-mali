"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { useState, type FormEvent } from "react";
import type { Schema } from "@didban/api-client";
import Link from "next/link";
import {
  Plus,
  ArrowUpLeft,
  UserRound,
  ShieldCheck,
  Settings2,
} from "lucide-react";
import { PageHeader } from "@/features/companies/company-view";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableRowHeader,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Select, Switch } from "@/components/ui/select";
import { Form } from "@/components/ui/form";
import { Field, Input, FormMessage, Textarea } from "@/components/ui/field";
import { roles, roleOptions } from "./roles";

export type Member = Schema<"MemberDirectoryEntry">;
export function MemberListView({
  company,
  members,
  onAdd,
  onEdit,
  onPermission,
  onPayrollPermission,
  more,
  busy,
  onMore,
}: {
  company: Schema<"Company">;
  members: Member[];
  onAdd: () => void;
  onEdit: (member: Member) => void;
  onPermission: (member: Member) => void;
  onPayrollPermission: (member: Member) => void;
  more: boolean;
  busy: boolean;
  onMore: () => void;
}) {
  return (
    <section className="motion-safe:animate-reveal">
      <PageHeader
        icon="ShieldCheck"
        title="اعضا و مجوزها"
        description={company.name}
        action={
          <Button onClick={onAdd}>
            <Plus size={18} aria-hidden />
            افزودن عضو
          </Button>
        }
      />
      <Button variant="ghost" asChild className="mb-5">
        <Link href={`/companies/${company.id}`}>
          بازگشت به شرکت
          <ArrowUpLeft size={16} aria-hidden />
        </Link>
      </Button>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>عضو</TableHead>
              <TableHead>نقش</TableHead>
              <TableHead>وضعیت</TableHead>
              <TableHead>مدیریت</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableRowHeader>
                  <p>{m.display_name}</p>
                  <p
                    dir="ltr"
                    className="mt-1 w-fit text-xs font-normal text-muted"
                  >
                    {m.email}
                  </p>
                </TableRowHeader>
                <TableCell>{roles[m.role]}</TableCell>
                <TableCell>
                  <Badge tone={m.active ? "success" : "neutral"}>
                    {m.active ? "فعال" : "غیرفعال"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <MemberActions
                    member={m}
                    onEdit={onEdit}
                    onPayrollPermission={onPayrollPermission}
                    onPermission={onPermission}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-4 md:hidden">
        {members.map((m) => (
          <article
            key={m.id}
            className="rounded-panel border border-border bg-surface p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-medium [overflow-wrap:anywhere]">
                  {m.display_name}
                </h2>
                <p dir="ltr" className="mt-1 break-all text-xs text-muted">
                  {m.email}
                </p>
              </div>
              <Badge tone={m.active ? "success" : "neutral"}>
                {m.active ? "فعال" : "غیرفعال"}
              </Badge>
            </div>
            <p className="my-4 text-muted">{roles[m.role]}</p>
            <MemberActions
              member={m}
              onEdit={onEdit}
              onPayrollPermission={onPayrollPermission}
              onPermission={onPermission}
            />
          </article>
        ))}
      </div>
      {more ? (
        <div className="mt-5 text-center">
          <Button variant="secondary" disabled={busy} onClick={onMore}>
            <AppIcon name="ChevronsDown" />
            {busy ? "در حال دریافت…" : "اعضای بیشتر"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
function MemberActions({
  member,
  onEdit,
  onPermission,
  onPayrollPermission,
}: {
  member: Member;
  onEdit: (m: Member) => void;
  onPermission: (m: Member) => void;
  onPayrollPermission: (m: Member) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      <Button variant="ghost" onClick={() => onEdit(member)}>
        <Settings2 size={16} aria-hidden />
        ویرایش نقش
      </Button>
      {member.active &&
      ["owner", "advisor_accountant"].includes(member.role) ? (
        <Button variant="ghost" onClick={() => onPermission(member)}>
          <ShieldCheck size={16} aria-hidden />
          مجوز تأیید گزارش
        </Button>
      ) : null}
      {member.active &&
      ["owner", "advisor_accountant"].includes(member.role) ? (
        <Button variant="ghost" onClick={() => onPayrollPermission(member)}>
          <ShieldCheck size={16} aria-hidden />
          مجوزهای حقوق
        </Button>
      ) : null}
    </div>
  );
}
export function AddMemberDialog({
  open,
  onOpenChange,
  onSubmit,
  busy,
  error,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error?: string;
}) {
  const [role, setRole] = useState("viewer");
  return (
    <Dialog
      icon="Users"
      open={open}
      onOpenChange={onOpenChange}
      title="افزودن عضو"
    >
      <Form onSubmit={onSubmit} className="space-y-5">
        <Field icon="Mail" id="member-email" label="ایمیل کاربر">
          <Input
            id="member-email"
            name="email"
            type="email"
            dir="ltr"
            required
            autoComplete="off"
          />
          <p className="text-xs text-muted">
            حساب کاربر باید توسط مدیر سازمان ایجاد شده باشد.
          </p>
        </Field>
        <Field icon="ShieldCheck" id="member-role" label="نقش در شرکت">
          <Select
            id="member-role"
            name="role"
            value={role}
            onValueChange={setRole}
            options={roleOptions}
          />
        </Field>
        <FormMessage>{error}</FormMessage>
        <Button type="submit" className="w-full" disabled={busy}>
          <UserRound size={17} aria-hidden />
          {busy ? "در حال ثبت…" : "افزودن عضو"}
        </Button>
      </Form>
    </Dialog>
  );
}
export function EditMemberDialog({
  member,
  onClose,
  onSubmit,
  busy,
  error,
  onRefresh,
}: {
  member: Member;
  onClose: () => void;
  onSubmit: (data: { role: Member["role"]; active: boolean }) => void;
  busy: boolean;
  error?: string;
  onRefresh: () => void;
}) {
  const [role, setRole] = useState<Member["role"]>(member.role),
    [active, setActive] = useState(member.active),
    [confirm, setConfirm] = useState(false);
  return (
    <>
      <Dialog
        icon="ShieldCheck"
        busy={busy}
        open
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
        title="ویرایش دسترسی"
        description={member.display_name}
      >
        <Form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!active || (member.role === "owner" && role !== "owner"))
              setConfirm(true);
            else onSubmit({ role, active });
          }}
        >
          <Field icon="ShieldCheck" id="edit-role" label="نقش در شرکت">
            <Select
              id="edit-role"
              value={role}
              onValueChange={(r) => setRole(r as Member["role"])}
              options={roleOptions}
            />
          </Field>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2" htmlFor="member-active">
              <AppIcon name="ShieldCheck" className="text-primary" />
              دسترسی فعال
            </label>
            <Switch
              id="member-active"
              checked={active}
              onCheckedChange={setActive}
              label="دسترسی فعال"
            />
          </div>
          {role !== member.role || !active ? (
            <p className="text-xs text-muted">
              تغییر نقش یا غیرفعال‌سازی، مجوزهای صریح تأیید گزارش و حقوق را لغو
              می‌کند.
            </p>
          ) : null}
          <FormMessage>{error}</FormMessage>
          {error ? (
            <Button variant="ghost" onClick={onRefresh}>
              <AppIcon name="Plus" />
              دریافت نسخه تازه
            </Button>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            <AppIcon name="Save" />
            {busy ? "در حال ثبت…" : "ذخیره دسترسی"}
          </Button>
        </Form>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="تغییر دسترسی عضو؟"
        description={`دسترسی ${member.display_name} ${!active ? "غیرفعال می‌شود" : "از مالک به نقش انتخاب‌شده تغییر می‌کند"}.`}
        onConfirm={() => onSubmit({ role, active })}
        busy={busy}
      >
        <FormMessage>{error}</FormMessage>
      </ConfirmDialog>
    </>
  );
}
export function PermissionForm({
  permission,
  onSubmit,
  busy,
  error,
  onRefresh,
}: {
  permission: Schema<"Permission">;
  onSubmit: (event: FormEvent<HTMLFormElement>, enabled: boolean) => void;
  busy: boolean;
  error?: string;
  onRefresh: () => void;
}) {
  const [enabled, setEnabled] = useState(permission.enabled);
  return (
    <Form
      className="space-y-5"
      onSubmit={(e) => {
        onSubmit(e, enabled);
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2" htmlFor="report-permission">
          <AppIcon name="ClipboardList" className="text-primary" />
          اجازه تأیید گزارش
        </label>
        <Switch
          id="report-permission"
          checked={enabled}
          onCheckedChange={setEnabled}
          label="اجازه تأیید گزارش"
        />
      </div>
      <Field icon="Users" id="permission-reason" label="دلیل تغییر">
        <Textarea
          id="permission-reason"
          name="reason"
          required
          maxLength={4000}
        />
      </Field>
      <FormMessage>{error}</FormMessage>
      {error ? (
        <Button variant="ghost" onClick={onRefresh}>
          <AppIcon name="Plus" />
          دریافت نسخه تازه
        </Button>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy}>
        <AppIcon name="Save" />
        {busy ? "در حال ثبت…" : "ثبت مجوز"}
      </Button>
    </Form>
  );
}
