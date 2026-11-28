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
  PaperclipIcon,
} from "@phosphor-icons/react";
import { useFloatingAssistant, type AssistantActionCard } from "@/hooks/use-floating-assistant";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Form } from "@/components/ui/form";
import { Textarea } from "@/components/ui/input";
import { EmptyState, LoadingState } from "@/components/ui/content-states";
import { displayDate, cn } from "@/lib/utils";
import { AssistantFacts } from "./assistant-facts";
import { AssistantDataTableWidget } from "./assistant-data-table";
import { assistantPromptItems, assistantSuggestions } from "./assistant-view";
import { AssistantVoiceButton, AssistantVoiceControls } from "./assistant-voice-controls";
export function FloatingAssistant() {
  const view = useFloatingAssistant();
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);

  const handleActionCard = (card: AssistantActionCard) => {
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
      if (path.startsWith("/accounting?review_draft=")) view.setOpen(false);
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

  useEffect(() => {
    if (input.current) {
      input.current.style.height = "auto";
      const scrollHeight = input.current.scrollHeight;
      input.current.style.height = `${Math.min(Math.max(scrollHeight, 40), 128)}px`;
    }
  }, [view.draft]);
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
              <div className="flex flex-col items-center justify-center py-6 text-center motion-safe:animate-fade-in">
                <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary shadow-xs">
                  <SparkleIcon size={26} weight="duotone" aria-hidden />
                </span>
                <div className="grid w-full gap-2">
                  {assistantPromptItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        view.setDraft(item.prompt);
                        input.current?.focus();
                      }}
                      className="flex items-center justify-between rounded-xl border border-border/80 bg-surface/80 p-2.5 text-start text-xs text-foreground transition-all hover:border-primary/50 hover:bg-primary-soft/40 active:scale-98"
                    >
                      <span className="flex items-center gap-2">
                        <SparkleIcon size={14} className="text-primary shrink-0" />
                        <span>{item.prompt}</span>
                      </span>
                      <ArrowLeftIcon size={13} className="text-muted shrink-0 ms-2" />
                    </button>
                  ))}
                </div>
              </div>
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
          {view.workspace.company && (
            <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto px-3 py-1.5 border-t border-border/60 bg-canvas/40 scrollbar-none">
              <span className="text-[11px] text-muted shrink-0 flex items-center gap-1 font-medium">
                <SparkleIcon size={12} className="text-primary" />
                پرسش سریع:
              </span>
              {assistantPromptItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    view.setDraft(item.prompt);
                    input.current?.focus();
                  }}
                  className="shrink-0 rounded-full border border-border/80 bg-surface px-2.5 py-0.5 text-[11px] text-foreground transition-colors hover:border-primary/50 hover:bg-primary-soft hover:text-primary active:scale-95"
                >
                  {item.shortLabel}
                </button>
              ))}
            </div>
          )}
          <div className="shrink-0 border-t border-border bg-surface p-2 sm:p-2.5">
            <Form
              ref={form}
              onSubmit={(event) => {
                event.preventDefault();
                view.send();
              }}
              className="space-y-2"
            >
              {(view.voice.phase !== "idle" || view.voice.error) && (
                <div className="rounded-2xl border border-border/80 bg-canvas/80 p-2.5 shadow-xs backdrop-blur-sm">
                  <AssistantVoiceControls voice={view.voice} />
                </div>
              )}

              <div className="flex items-end gap-1.5 rounded-2xl border border-border/80 bg-canvas/60 p-1.5 shadow-xs transition-colors focus-within:border-primary/50 focus-within:bg-surface focus-within:ring-2 focus-within:ring-primary/10">
                {/* 1. Attachment / Options (Start - Right in RTL) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={view.busy || !view.workspace.company}
                      className="size-10 sm:size-11 shrink-0 rounded-full p-0 text-muted hover:bg-surface hover:text-foreground active:scale-95"
                      aria-label="امکانات و پرسش‌های پیشنهادی"
                    >
                      <PaperclipIcon size={18} className="scale-x-[-1]" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-72">
                    <DropdownMenuLabel className="flex items-center gap-1.5 font-medium text-foreground">
                      <SparkleIcon size={14} className="text-primary" aria-hidden />
                      <span>پرسش‌های پیشنهادی مالی</span>
                    </DropdownMenuLabel>
                    {assistantSuggestions.map((prompt) => (
                      <DropdownMenuItem
                        key={prompt}
                        onClick={() => {
                          view.setDraft(prompt);
                          input.current?.focus();
                        }}
                        className="text-xs leading-5"
                      >
                        {prompt}
                      </DropdownMenuItem>
                    ))}
                    {view.messages.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={view.reset}
                          className="text-xs text-muted hover:text-danger"
                        >
                          <ArrowClockwiseIcon size={14} aria-hidden />
                          <span>گفت‌وگوی جدید (پاک‌سازی چت)</span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* 2. Text input (Center) */}
                <label htmlFor="floating-assistant-message" className="sr-only">
                  پیام به دستیار مالی
                </label>
                <Textarea
                  ref={input}
                  id="floating-assistant-message"
                  value={view.draft}
                  onChange={(event) => view.setDraft(event.target.value)}
                  placeholder="پیام شما…"
                  rows={1}
                  className="h-10 min-h-10 max-h-32 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-xs sm:text-sm leading-5 shadow-none focus:border-0 focus:ring-0 focus-visible:ring-0 placeholder:text-muted"
                  disabled={view.busy || !view.workspace.company || view.voice.phase === "recording"}
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

                {/* 3. Action button (End - Left in RTL): Send when text exists, Voice when empty */}
                {view.draft.trim().length > 0 ? (
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={
                      !view.workspace.company || !view.draft.trim() || view.busy || view.voice.phase !== "idle"
                    }
                    busy={view.busy}
                    aria-label="ارسال پیام"
                    className="size-10 sm:size-11 shrink-0 rounded-full p-0 shadow-action active:scale-95"
                  >
                    <span className="sr-only">ارسال پیام</span>
                    <PaperPlaneTiltIcon size={17} className="scale-x-[-1]" aria-hidden />
                  </Button>
                ) : (
                  <AssistantVoiceButton
                    voice={view.voice}
                    disabled={view.busy || !view.workspace.company}
                    className="size-10 sm:size-11 shrink-0 rounded-full active:scale-95"
                  />
                )}
              </div>
            </Form>
          </div>
        </Drawer>
    </div>
  );
}
