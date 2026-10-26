"use client";

import { createElement, Fragment, isValidElement, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Building2, LifeBuoy, GitBranch, Trash2, Activity, Calendar, CheckCircle2, Clock, FileText, Hash, Key, Landmark, Layers, Server, Mail, Search, Settings, ShieldCheck, User, Wallet, type AppIcon } from "./icons";
import { TruncatedText } from "./tooltip";
import { cn } from "@/lib/utils";

/** Shared presentation vocabulary for named and imported financial fields. */
export function fieldIcon(label: string): AppIcon {
  if (/جست|search/i.test(label)) return Search;
  if (/شرکت|فضای کاری|company|workspace/i.test(label)) return Building2;
  if (/ماه|سال مالی/i.test(label)) return Calendar;
  if (/پشتیبان|support/i.test(label)) return LifeBuoy;
  if (/منشأ|منشا|lineage/i.test(label)) return GitBranch;
  if (/حذف|delete/i.test(label)) return Trash2;
  if (/اتصال|سرویس|آدرس|سیستم|connection|server|provider/i.test(label)) return Server;
  if (/تنظیم|ساختار|نوع|system|mode/i.test(label)) return Settings;
  if (/تاریخ|تقویم|سررسید|موعد|date|calendar/i.test(label)) return Calendar;
  if (/موجودی|نقد|اختلاف|مبلغ|مانده|واریز|برداشت|بدهی|مطالبات|وصول|واحد|پرداخت|amount|currency/i.test(label)) return Wallet;
  if (/دوره|روز|period/i.test(label)) return Calendar;
  if (/کلید|توکن|دسترسی|password|token|key/i.test(label)) return Key;
  if (/ایمیل|email/i.test(label)) return Mail;
  if (/بانک|شبا|سپرده|حساب|bank|account/i.test(label)) return Landmark;
  if (/وضعیت|نتیجه|status/i.test(label)) return Activity;
  if (/اطمینان|ریسک|اهمیت|نقش|سطح|role/i.test(label)) return ShieldCheck;
  if (/تأیید|تایید|قابل ثبت|confirm/i.test(label)) return CheckCircle2;
  if (/مشتری|تأمین|مسئول|عضو|نام|name/i.test(label)) return User;
  if (/زمان|فاصله|تأخیر|دریافت|delay|interval/i.test(label)) return Clock;
  if (/شیت|ردیف|ستون|پوشش|تعداد|رکورد|sheet|column|row/i.test(label)) return Layers;
  if (/شماره|شناسه|نسخه|هش|مرجع|number|reference|version|id/i.test(label)) return Hash;
  return FileText;
}

function textValue(value: ReactNode): string | null {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(textValue);
    return parts.every(part => part !== null) ? parts.join("") : null;
  }
  if (isValidElement<{ children?: ReactNode }>(value) && (value.type === Fragment || (typeof value.type === "string" && ["bdi", "span", "strong", "b", "code"].includes(value.type)))) return textValue(value.props.children);
  return null;
}

/** Equal-height details. Full values are disclosed only when the visible text is clipped. */
export function DetailField({ icon: Icon, label, children, className, ...props }: ComponentPropsWithoutRef<"div"> & {
  icon: AppIcon; label: ReactNode;
}) {
  const value = textValue(children);
  const labelText = textValue(label);
  return <div data-slot="field-layout" className={cn("flex h-16 min-w-0 items-start gap-3", className)} {...props}>
    <Icon size={19} aria-hidden="true" className="mt-1 shrink-0 text-primary/75" />
    <div className="grid min-w-0 flex-1 gap-1.5">
      <dt className="min-w-0 truncate text-xs leading-relaxed text-muted-foreground">{labelText !== null ? <TruncatedText text={labelText} /> : label}</dt>
      <dd className="h-7 min-w-0 text-sm leading-7 text-foreground [&_[data-slot=hint-trigger]]:max-w-full [&_[data-slot=hint-trigger]>span:last-child]:truncate">{value !== null ? <TruncatedText text={value || "—"} /> : children}</dd>
    </div>
  </div>;
}

/** An icon-led form label; control and error semantics stay with the shared form primitives. */
export function ControlLabel({ icon: Icon, children, className, ...props }: ComponentPropsWithoutRef<"label"> & { icon: AppIcon }) {
  const text = textValue(children);
  return <label data-slot="control-label" className={cn("!flex min-h-6 min-w-0 items-center gap-2 text-sm leading-relaxed", text !== null && "h-6", className)} {...props}><Icon size={18} aria-hidden="true" className="shrink-0 text-primary/75" /><span className="flex min-w-0 flex-1 items-center gap-2">{text !== null ? <TruncatedText text={text} className="flex-1" /> : children}</span></label>;
}

export function DetailSection({ title, children, className, ...props }: ComponentPropsWithoutRef<"section"> & { title?: string }) {
  return <section className={cn("flex min-w-0 flex-col gap-4 [&+section]:border-t [&+section]:border-border [&+section]:pt-5", className)} {...props}>
    {title && <h3 className="flex min-w-0 items-center gap-2.5 text-sm font-medium leading-relaxed">{createElement(fieldIcon(title), { size: 19, "aria-hidden": true, className: "shrink-0 text-primary" })}<TruncatedText text={title} /></h3>}
    {children}
  </section>;
}

export function DetailGroup({ className, ...props }: ComponentPropsWithoutRef<"dl">) {
  return <dl className={cn("grid min-w-0 auto-rows-[64px] grid-cols-1 gap-x-6 gap-y-5 text-sm leading-relaxed sm:grid-cols-2", className)} {...props} />;
}

