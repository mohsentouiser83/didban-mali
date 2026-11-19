"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChatCircleDotsIcon,
  PaperPlaneTiltIcon,
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  FileTextIcon,
  BellIcon,
  ChartLineUpIcon,
  SparkleIcon,
  CheckCircleIcon,
  BankIcon,
} from "@phosphor-icons/react";
import { useFloatingAssistant, type AssistantActionCard } from "@/hooks/use-floating-assistant";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Form } from "@/components/ui/form";
import { Textarea } from "@/components/ui/input";
import { EmptyState, LoadingState } from "@/components/ui/content-states";
import { displayDate, cn } from "@/lib/utils";
import { AssistantFacts } from "./assistant-facts";
import { AssistantDataTableWidget } from "./assistant-data-table";
import { AssistantVoiceButton, AssistantVoiceControls } from "./assistant-voice-controls";
export function FloatingAssistant() {
  const view = useFloatingAssistant();
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);

  const handleActionCard = (card: AssistantActionCard) => {
    if (card.action_type === "confirm_post") {
      view.send("تأیید کن");
      return;
    }
    if (card.action_type === "suggest_text" && card.payload?.text) {
      view.setDraft(String(card.payload.text));
      input.current?.focus();
      return;
    }
    if (card.target_path) {
      const path = card.target_path.startsWith("/")
        ? card.target_path
        : view.workspace.companyPath(card.target_path) || `/${card.target_path}`;
      router.push(path);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("didban:assistant-action", { detail: card }),
      );
    }
  };

  const renderActionCardIcon = (card: AssistantActionCard) => {
    const icon = (card.icon || card.action_type).toLowerCase();
    if (icon.includes("invoice") || icon.includes("receipt") || icon.includes("bill")) {
      return <FileTextIcon size={16} aria-hidden />;
    }
    if (icon.includes("reminder") || icon.includes("collection") || icon.includes("bell")) {
      return <BellIcon size={16} aria-hidden />;
    }
    if (icon.includes("chart") || icon.includes("report")) {
      return <ChartLineUpIcon size={16} aria-hidden />;
    }
    if (icon.includes("bank") || icon.includes("account")) {
      return <BankIcon size={16} aria-hidden />;
    }
    if (icon.includes("approve") || icon.includes("check")) {
      return <CheckCircleIcon size={16} aria-hidden />;
    }
    return <SparkleIcon size={16} aria-hidden />;
  };

  useEffect(() => {
    if (view.open) end.current?.scrollIntoView?.({ block: "nearest" });
  }, [view.messages, view.open]);
  return (
    <div className="fixed bottom-4 left-4 z-40 sm:bottom-6 sm:left-6">

          <Button
            onClick={() => view.setOpen(true)}
            aria-expanded={view.open}
            aria-label="گفت‌وگو با دستیار مالی"
            className="size-14 rounded-full p-0 shadow-overlay"
          >
            <ChatCircleDotsIcon size={27} weight="duotone" aria-hidden />
          </Button>
        <Drawer
          open={view.open}
          onOpenChange={view.setOpen}
          title="دستیار مالی"
          modal={false}
          className="inset-y-0 end-0 h-screen max-h-dvh w-full rounded-none border-primary/30 p-0 sm:p-0"
          headerClassName="m-0 border-b border-border px-5 py-3"
          bodyClassName="flex flex-1 flex-col overflow-hidden pe-0"
        >
          <div
            role="log"
            aria-label="پیام‌های گفت‌وگو"
            aria-live="polite"
            aria-relevant="additions text"
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4"
          >
            {!view.workspace.company ? (
              <EmptyState
                compact
                title="یک شرکت انتخاب کنید."
                action={
                  view.workspace.user?.installation_admin ? (
                    <ButtonLink
                      href="/settings/company"
                      variant="secondary"
                      onClick={() => view.setOpen(false)}
                    >
                      مدیریت شرکت
                    </ButtonLink>
                  ) : undefined
                }
              />
            ) : !view.messages.length ? (
              <EmptyState compact title="پرسش خود را بنویسید" />
            ) : (
              view.messages.map((message) => (
                <article
                  key={message.id}
                  aria-label={
                    message.role === "user" ? "پیام شما" : "پاسخ دستیار مالی"
                  }
                  className={cn(
                    "max-w-[94%] rounded-panel p-3 motion-safe:animate-page-reveal",
                    message.role === "user"
                      ? "ms-auto bg-primary-soft text-foreground"
                      : "me-auto border border-border bg-canvas/55",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words text-sm leading-7">
                    {message.text}
                  </p>
                  {message.pending && (
                    <LoadingState
                      label="در حال آماده‌سازی پاسخ"
                      variant="message"
                    />
                  )}
                  {message.error && (
                    <div className="space-y-2">
                      <p role="alert" className="text-sm leading-7 text-danger">
                        {message.error}
                      </p>
                      <Button
                        variant="ghost"
                        disabled={view.busy}
                        onClick={() => view.retry(message.id)}
                        className="px-1 text-xs"
                      >
                        <ArrowClockwiseIcon size={16} />
                        تلاش دوباره
                      </Button>
                    </div>
                  )}
                  {message.reply?.as_of_date && (
                    <p className="mt-2 text-[11px] text-muted">
                      تا {displayDate(message.reply.as_of_date)}
                    </p>
                  )}
                  {message.reply?.facts?.length ? (
                    <AssistantFacts
                      facts={message.reply.facts}
                      unit={view.workspace.unit}
                    />
                  ) : null}
                  {(message.data_table || message.reply?.data_table) && (
                    <AssistantDataTableWidget
                      dataTable={(message.data_table || message.reply?.data_table)!}
                    />
                  )}
                  {Boolean(
                    (message.action_cards || message.reply?.action_cards)?.length,
                  ) && (
                    <div
                      className="mt-3 space-y-2"
                      role="region"
                      aria-label="اقدامات پیشنهادی"
                    >
                      {(
                        message.action_cards || message.reply?.action_cards
                      )?.map((card) => {
                        const buttonLabel =
                          card.button_text ||
                          (card.action_type.includes("view")
                            ? "مشاهده"
                            : "اقدام");
                        return (
                          <div
                            key={card.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-surface/90 p-3 shadow-sm backdrop-blur-sm transition-all hover:border-primary/50"
                          >
                            <div className="flex min-w-0 items-start gap-2.5">
                              <span
                                className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"
                                aria-hidden
                              >
                                {renderActionCardIcon(card)}
                              </span>
                              <div className="min-w-0">
                                <h4 className="text-xs font-medium text-foreground">
                                  {card.title}
                                </h4>
                                {card.description && (
                                  <p className="mt-0.5 text-[11px] leading-5 text-muted">
                                    {card.description}
                                  </p>
                                )}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant={
                                card.variant === "primary"
                                  ? "primary"
                                  : "secondary"
                              }
                              className="h-8 min-h-8 shrink-0 px-2.5 text-xs"
                              onClick={() => handleActionCard(card)}
                              aria-label={`${buttonLabel}: ${card.title}`}
                            >
                              <span>{buttonLabel}</span>
                              <ArrowLeftIcon size={13} aria-hidden />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              ))
            )}
            <div ref={end} />
          </div>
          <div className="shrink-0 border-t border-border bg-surface p-2">
            <Form
              ref={form}
              onSubmit={(event) => {
                event.preventDefault();
                view.send();
              }}
              className="space-y-2"
            >
              <label htmlFor="floating-assistant-message" className="sr-only">
                پیام به دستیار مالی
              </label>
              <div className="flex items-end gap-2">
                <AssistantVoiceButton voice={view.voice} disabled={view.busy || !view.workspace.company} />
              <Textarea
                ref={input}
                id="floating-assistant-message"
                value={view.draft}
                onChange={(event) => view.setDraft(event.target.value)}
                placeholder="پیام شما…"
                rows={1}
                className="h-11 min-h-11 min-w-0 flex-1 resize-none"
                disabled={view.busy || !view.workspace.company || view.voice.phase !== "idle"}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    form.current?.requestSubmit();
                  }
                }}
              />
                <Button
                  type="submit"
                  disabled={
                    !view.workspace.company || !view.draft.trim() || view.busy || view.voice.phase !== "idle"
                  }
                  busy={view.busy}
                  aria-label="ارسال پیام"
                  className="size-11 shrink-0 p-0"
                >
                  <PaperPlaneTiltIcon size={17} aria-hidden />
                </Button>
              </div>
              <AssistantVoiceControls voice={view.voice} />
            </Form>
          </div>
        </Drawer>
    </div>
  );
}
