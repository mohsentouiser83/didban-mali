"use client";

import { AppIcon, IconTile, type AppIconName } from "@/components/ui/app-icon";
import Link from "next/link";
import type { Schema } from "@didban/api-client";
import type { ReactNode, FormEvent } from "react";
import {
  CalendarRange,
  UploadCloud,
  Building2,
  ArrowUpLeft,
  Plus,
  ShieldCheck,
  Settings2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { Dialog } from "@/components/ui/dialog";
import { Input, Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
export function PageHeader({
  title,
  icon = "Building2",
  description,
  action,
}: {
  title: string;
  icon?: AppIconName;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <IconTile name={icon} />
        <div className="min-w-0">
          <h1 className="font-heading text-[26px] font-medium leading-relaxed [overflow-wrap:anywhere]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {action}
    </div>
  );
}
export function CompaniesView({
  companies,
  create,
  more,
  busy,
  onMore,
}: {
  companies: Schema<"Company">[];
  create?: ReactNode;
  more: boolean;
  busy: boolean;
  onMore: () => void;
}) {
  return (
    <section className="motion-safe:animate-reveal">
      <PageHeader
        icon="Building2"
        title="شرکت‌ها"
        action={companies.length ? create : undefined}
      />
      {companies.length ? (
        <>
          <div className="mb-7 flex items-center gap-3 rounded-summary border border-primary/10 bg-linear-to-l from-accent to-surface p-5 sm:p-7">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-primary shadow-panel">
              <ShieldCheck size={24} aria-hidden />
            </span>
            <div>
              <h2 className="font-heading text-lg font-medium">
                فضای مستقل هر شرکت
              </h2>
              <p className="mt-1 text-sm text-muted">
                شرکت موردنظر را برای مدیریت انتخاب کنید.
              </p>
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {companies.map((c) => (
              <Link
                key={c.id}
                href={`/companies/${c.id}`}
                prefetch={false}
                className="group flex min-w-0 flex-col rounded-panel border border-border bg-surface p-6 shadow-panel transition-[border-color,box-shadow,transform] duration-200 hover:border-primary/30 hover:shadow-float focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none"
              >
                <div className="mb-7 flex items-center justify-between gap-3">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-background text-primary">
                    <Building2 size={24} aria-hidden />
                  </span>
                  <Badge tone={c.archived ? "neutral" : "success"}>
                    {c.archived ? "بایگانی‌شده" : "فعال"}
                  </Badge>
                </div>
                <h2 className="break-words font-heading text-lg font-medium">
                  {c.name}
                </h2>
                <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                  <span className="text-xs text-muted">
                    نمایش مبالغ: {c.display_unit === "IRR" ? "ریال" : "تومان"}
                  </span>
                  <ArrowUpLeft size={18} className="text-primary" aria-hidden />
                </div>
              </Link>
            ))}
          </div>
          {more ? (
            <div className="mt-6 text-center">
              <Button variant="secondary" onClick={onMore} disabled={busy}>
                <AppIcon name="ChevronsDown" />
                {busy ? "در حال دریافت…" : "شرکت‌های بیشتر"}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon="Building2"
          title="شرکتی برای نمایش نیست"
          description="هنوز عضویت فعالی در شرکتی ندارید."
          action={create}
        />
      )}
    </section>
  );
}
export function CompanyCreateDialog({
  open,
  onOpenChange,
  owner,
  owners,
  loadingMore,
  onMore,
  onSubmit,
  busy,
  error,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  owner: string;
  owners: { value: string; label: string }[];
  loadingMore: boolean;
  onMore?: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error?: string;
}) {
  return (
    <Dialog
      icon="Building2"
      busy={busy}
      open={open}
      onOpenChange={onOpenChange}
      title="شرکت جدید"
      trigger={
        <Button>
          <Plus size={18} aria-hidden />
          شرکت جدید
        </Button>
      }
    >
      <Form className="space-y-5" onSubmit={onSubmit}>
        <Field icon="Building2" id="company-name" label="نام شرکت">
          <Input id="company-name" name="name" required maxLength={4000} />
        </Field>
        <Field icon="ShieldCheck" id="company-owner" label="مالک اولیه">
          <CompanyOwnerSelect owner={owner} options={owners} />
        </Field>
        {onMore ? (
          <Button variant="ghost" onClick={onMore} disabled={loadingMore}>
            <AppIcon name="ChevronsDown" />
            کاربران بیشتر
          </Button>
        ) : null}
        <UnitSelect />
        <FormMessage>{error}</FormMessage>
        <Button type="submit" className="w-full" disabled={busy}>
          <AppIcon name="Plus" />
          {busy ? "در حال ایجاد…" : "ایجاد شرکت"}
        </Button>
      </Form>
    </Dialog>
  );
}
import { useState } from "react";

function CompanyOwnerSelect({
  owner,
  options,
}: {
  owner: string;
  options: { value: string; label: string }[];
}) {
  const [value, setValue] = useState(owner);
  return (
    <Select
      id="company-owner"
      name="owner_user_id"
      value={value}
      onValueChange={setValue}
      options={options}
    />
  );
}
export function UnitSelect({ initial = "IRR" }: { initial?: "IRR" | "IRT" }) {
  const [value, setValue] = useState<string>(initial);
  return (
    <Field icon="Coins" id="display-unit" label="واحد نمایش">
      <Select
        id="display-unit"
        name="display_unit"
        value={value}
        onValueChange={setValue}
        options={[
          { value: "IRR", label: "ریال" },
          { value: "IRT", label: "تومان" },
        ]}
      />
    </Field>
  );
}
export function CompanyOverview({
  company,
  role,
  canManage,
  canApprove,
}: {
  company: Schema<"Company">;
  role: string;
  canManage: boolean;
  canApprove: boolean;
}) {
  return (
    <section className="motion-safe:animate-reveal">
      <PageHeader
        icon="Building2"
        title={company.name}
        action={
          <Button variant="ghost" asChild>
            <Link href="/companies">
              همه شرکت‌ها
              <ArrowUpLeft size={16} aria-hidden />
            </Link>
          </Button>
        }
      />
      <section className="rounded-summary border border-primary/10 bg-linear-to-l from-accent to-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-panel bg-surface text-primary">
              <Building2 size={28} aria-hidden />
            </span>
            <div>
              <h2 className="font-heading text-lg font-medium">دسترسی شما</h2>
              <p className="mt-1 text-muted">{role}</p>
            </div>
          </div>
          <Badge tone={company.archived ? "neutral" : "success"}>
            {company.archived ? "شرکت بایگانی‌شده" : "شرکت فعال"}
          </Badge>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 border-t border-primary/10 pt-5">
          <Badge>
            نمایش مبالغ: {company.display_unit === "IRR" ? "ریال" : "تومان"}
          </Badge>
          <Badge tone={canApprove ? "primary" : "neutral"}>
            {canApprove ? "مجوز تأیید گزارش دارید" : "تأیید گزارش: بدون مجوز"}
          </Badge>
        </div>
      </section>
      {
        <nav
          aria-label="مدیریت شرکت"
          className="mt-5 grid gap-5 sm:grid-cols-2"
        >
          {[
            { path: "uploads", label: "بارگذاری و پردازش", icon: UploadCloud },
            { path: "periods", label: "دوره‌های مالی", icon: CalendarRange },
            ...(canManage
              ? [
                  { path: "members", label: "اعضا و مجوزها", icon: Users },
                  { path: "settings", label: "تنظیمات شرکت", icon: Settings2 },
                ]
              : []),
          ].map((item) => (
            <Link
              key={item.path}
              href={`/companies/${company.id}/${item.path}`}
              prefetch={false}
              className="flex items-center gap-4 rounded-panel border border-border bg-surface p-6 shadow-panel transition-colors hover:border-primary/30 focus-visible:outline-primary"
            >
              <span className="flex size-11 items-center justify-center rounded-control bg-background text-primary">
                <item.icon size={21} aria-hidden />
              </span>
              <span className="font-medium">{item.label}</span>
              <ArrowUpLeft
                size={18}
                className="ms-auto text-muted"
                aria-hidden
              />
            </Link>
          ))}
        </nav>
      }
    </section>
  );
}
