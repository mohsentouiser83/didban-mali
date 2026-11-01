"use client";

import { ChatCircleDotsIcon, CheckCircleIcon, CopyIcon, ArrowSquareOutIcon, TelegramLogoIcon, LinkBreakIcon } from "@phosphor-icons/react";
import type { BotConnection, BotProviderCard } from "@/lib/bot-connections";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/content-states";
import { persian } from "@/lib/utils";
import { Panel } from "./page-parts";

export function BotProviderPanel({ card, busy, pendingAction, onCreate, onCopy, onConfirm, onDisconnect }: {
  card: BotProviderCard;
  busy: boolean;
  pendingAction?: "create" | "confirm" | "revoke";
  onCreate: () => void;
  onCopy: () => void;
  onConfirm: (connection: BotConnection) => void;
  onDisconnect: (connection: BotConnection) => void;
}) {
  const Icon = card.provider === "telegram" ? TelegramLogoIcon : ChatCircleDotsIcon;
  return <Panel className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-control bg-primary-soft text-primary"><Icon size={26} aria-hidden /></span>
        <div><h2 className="font-display text-lg font-medium">{card.label}</h2>
          {card.username && <span dir="ltr" className="mt-1 block text-xs text-muted">@{card.username}</span>}
        </div>
      </div>
      <Badge tone={card.active ? "success" : card.pending ? "warning" : "neutral"}>
        {card.active ? <><CheckCircleIcon size={15} aria-hidden />متصل</> : card.pending ? "اتصال ناتمام" : "متصل نیست"}
      </Badge>
    </div>
    {card.active && <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border p-4">
      <div><p className="text-xs text-muted">شناسه حساب متصل</p><p dir="ltr" className="mt-1 font-mono text-sm">{card.active.sender_id}</p></div>
      <Button variant="danger" disabled={busy} onClick={() => onDisconnect(card.active!)}><LinkBreakIcon size={18} aria-hidden />قطع اتصال</Button>
    </div>}
    {!card.configured && <StatusMessage>اتصال {card.label} باید توسط مدیر نصب تنظیم شود.</StatusMessage>}
    {card.pending ? <PendingPairing card={card} busy={busy} pendingAction={pendingAction} onCreate={onCreate} onCopy={onCopy} onConfirm={onConfirm} onDisconnect={onDisconnect} /> : !card.active && card.configured ? <div className="flex flex-1 flex-col items-start justify-between gap-5">
      <p className="text-sm leading-7 text-muted">حساب خود را برای پرسش از گزارش این شرکت وصل کنید.</p>
      <Button busy={pendingAction === "create"} disabled={busy} onClick={onCreate}>اتصال {card.label}</Button>
    </div> : null}
  </Panel>;
}

function PendingPairing({ card, busy, pendingAction, onCreate, onCopy, onConfirm, onDisconnect }: {
  card: BotProviderCard; busy: boolean; pendingAction?: "create" | "confirm" | "revoke"; onCreate: () => void; onCopy: () => void;
  onConfirm: (connection: BotConnection) => void; onDisconnect: (connection: BotConnection) => void;
}) {
  const pending = card.pending!;
  return <div className="space-y-4 border-t border-border pt-5">
    {card.expired ? <>
      <StatusMessage>مهلت اتصال تمام شد.</StatusMessage>
      <div className="flex flex-wrap gap-2"><Button busy={pendingAction === "create"} disabled={busy || !card.configured} onClick={onCreate}>کد اتصال جدید</Button><Button variant="ghost" disabled={busy} onClick={() => onDisconnect(pending)}>لغو اتصال</Button></div>
    </> : pending.state === "awaiting_confirmation" ? <>
      <div role="status" className="space-y-3">
        <h3 className="font-medium">حساب دریافت شد</h3>
        <p className="text-sm leading-7 text-muted">فقط اگر این حساب متعلق به شماست، اتصال را تأیید کنید.</p>
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control bg-canvas p-4"><dt className="text-xs text-muted">شناسه حساب</dt><dd dir="ltr" className="font-mono text-sm">{pending.sender_id}</dd></dl>
      </div>
      <div className="flex flex-wrap gap-2"><Button busy={pendingAction === "confirm"} disabled={busy || !card.configured} onClick={() => onConfirm(pending)}>تأیید این حساب</Button><Button variant="secondary" disabled={busy} onClick={() => onDisconnect(pending)}>لغو اتصال</Button></div>
    </> : <>
      {card.pairingCommand ? <>
        <p className="text-sm leading-7">این فرمان را در چت خصوصی بات {card.label} بفرستید.</p>
        <div className="space-y-3 rounded-control border border-border bg-canvas p-4">
          <code dir="ltr" className="block select-all break-all font-mono text-sm leading-7" aria-label={`فرمان اتصال ${card.label}`}>{card.pairingCommand}</code>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy || !card.configured} onClick={onCopy}><CopyIcon size={18} aria-hidden />{card.copied ? "کپی شد" : "کپی فرمان"}</Button>
            {card.botUrl && <ButtonLink href={card.botUrl} target="_blank" variant="soft"><ArrowSquareOutIcon size={18} aria-hidden />باز کردن بات</ButtonLink>}
          </div>
        </div>
        {!card.username && <p className="text-xs leading-6 text-muted">نشانی بات را از مدیر نصب بگیرید.</p>}
        <p className="text-xs text-muted">پس از ارسال، تأیید حساب همین‌جا نمایش داده می‌شود.</p>
      </> : <>
        <p className="text-sm leading-7 text-muted">کد قبلی در این مرورگر موجود نیست.</p>
        <Button busy={pendingAction === "create"} disabled={busy || !card.configured} onClick={onCreate}>کد اتصال جدید</Button>
      </>}
      <Button variant="ghost" disabled={busy} onClick={() => onDisconnect(pending)}>لغو اتصال</Button>
    </>}
    {!card.expired && <p className="text-xs text-muted" aria-label="مهلت اتصال">مهلت باقی‌مانده: <span className="tabular-nums">{persian(card.remainingMinutes)}</span> دقیقه</p>}
  </div>;
}
