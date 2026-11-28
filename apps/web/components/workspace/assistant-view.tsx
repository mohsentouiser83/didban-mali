"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SparkleIcon,
  PaperPlaneTiltIcon,
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  FileTextIcon,
  BellIcon,
  ChartLineUpIcon,
  BankIcon,
  CheckCircleIcon,
  ChatCircleDotsIcon,
  PaperclipIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
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
import {
  useFloatingAssistant,
  type AssistantActionCard,
} from "@/hooks/use-floating-assistant";
import { displayDate, cn } from "@/lib/utils";
import { AssistantFacts } from "./assistant-facts";
import {
  AssistantVoiceButton,
  AssistantVoiceControls,
} from "./assistant-voice-controls";
import { EvidenceList } from "./evidence-list";
import { NoCompany, PageHeader } from "./page-parts";

export interface AssistantPromptItem {
  id: string;
  shortLabel: string;
  prompt: string;
  category: "cash" | "profit" | "ar" | "review" | "drafts";
}

export const assistantPromptItems: AssistantPromptItem[] = [
  {
    id: "cash",
    shortLabel: "مانده نقد و بانک",
    prompt: "مانده نقدینگی و وضعیت حساب‌ها چقدر است؟",
    category: "cash",
  },
  {
    id: "profit",
    shortLabel: "سود و زیان دوره",
    prompt: "خلاصه سود، زیان و هزینه‌های این دوره را بگو.",
    category: "profit",
  },
  {
    id: "ar",
    shortLabel: "مطالبات معوق",
    prompt: "بزرگ‌ترین مطالبات معوق و اشخاص بدهکار کیستند؟",
    category: "ar",
  },
  {
    id: "review",
    shortLabel: "مغایرت‌ها و ریسک‌ها",
    prompt: "آیا مغایرت یا بررسی ضروری در اسناد وجود دارد؟",
    category: "review",
  },
  {
    id: "drafts",
    shortLabel: "اسناد نیازمند تأیید",
    prompt: "وضعیت اسناد پیش‌نویس در انتظار ثبت را گزارش کن.",
    category: "drafts",
  },
];

export const assistantSuggestions = assistantPromptItems.map((item) => item.prompt);
const suggestions = assistantSuggestions;

export function AssistantView() {
  const view = useFloatingAssistant({ defaultOpen: true });
  const router = useRouter();
  const logContainer = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [evidence, setEvidence] = useState<{
    title: string;
    refs: string[];
  } | null>(null);

  // Lock outer page / document scrolling while on chat page
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  const handleActionCard = (card: AssistantActionCard) => {
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
    if (
      icon.includes("invoice") ||
      icon.includes("receipt") ||
      icon.includes("bill")
    ) {
      return <FileTextIcon size={16} aria-hidden />;
    }
    if (
      icon.includes("reminder") ||
      icon.includes("collection") ||
      icon.includes("bell")
    ) {
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
    if (logContainer.current) {
      logContainer.current.scrollTo?.({
        top: logContainer.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [view.messages]);

  useEffect(() => {
    if (input.current) {
      input.current.style.height = "auto";
      const scrollHeight = input.current.scrollHeight;
      input.current.style.height = `${Math.min(Math.max(scrollHeight, 44), 144)}px`;
    }
  }, [view.draft]);

  if (!view.workspace.company) return <NoCompany />;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0">
        <PageHeader
          icon={SparkleIcon}
          title="تحلیل با هوش مصنوعی"
          action={
            view.messages.length > 0 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={view.reset}
                className="gap-2 text-xs"
                aria-label="گفت‌وگوی جدید"
              >
                <ArrowClockwiseIcon size={16} aria-hidden />
                <span>گفت‌وگوی جدید</span>
              </Button>
            ) : undefined
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-border bg-surface shadow-xs overflow-hidden">
        {/* Chat log & workspace */}
        <div
          ref={logContainer}
          role="log"
            aria-label="پیام‌های هوش مصنوعی"
            aria-live="polite"
            aria-relevant="additions text"
            className="flex-1 space-y-6 overflow-y-auto overscroll-contain p-5 sm:p-7"
          >
            {view.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <span className="mb-4 grid size-16 place-items-center rounded-2xl bg-primary-soft text-primary shadow-xs">
                  <SparkleIcon size={34} weight="duotone" aria-hidden />
                </span>
                <div className="flex max-w-xl flex-wrap justify-center gap-2">
                  {suggestions.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => view.setDraft(prompt)}
                      className="rounded-full border border-border/80 bg-canvas/80 px-3.5 py-2 text-xs text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-primary-soft hover:text-primary active:scale-95"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              view.messages.map((message) => (
                <article
                  key={message.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-2xl p-4 sm:p-5",
                    message.role === "user"
                      ? "ms-auto max-w-2xl bg-primary-soft text-foreground"
                      : "me-auto max-w-3xl border border-border/80 bg-canvas/60 text-foreground",
                  )}
                >
                  <header className="flex items-center justify-between gap-3 text-[11px] text-muted">
                    <span className="flex items-center gap-1.5 font-medium">
                      {message.role === "user" ? (
                        <>
                          <ChatCircleDotsIcon size={14} aria-hidden />
                          <span>شما</span>
                        </>
                      ) : (
                        <>
                          <SparkleIcon size={14} className="text-primary" aria-hidden />
                          <span className="text-primary font-medium">هوش مصنوعی</span>
                        </>
                      )}
                    </span>
                    {message.reply?.as_of_date && (
                      <span>تا {displayDate(message.reply.as_of_date)}</span>
                    )}
                  </header>

                  {message.pending ? (
                    <div className="flex items-center gap-2 py-3 text-xs text-muted">
                      <span className="inline-block size-2 animate-ping rounded-full bg-primary" />
                      <span>در حال تحلیل دفاتر مالی و پاسخ...</span>
                    </div>
                  ) : message.error ? (
                    <div className="space-y-2 py-2">
                      <p className="text-xs text-danger">{message.error}</p>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => view.retry(message.id)}
                        className="h-8 text-xs"
                      >
                        تلاش مجدد
                      </Button>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-xs leading-7 sm:text-sm sm:leading-8">
                      {message.text}
                    </p>
                  )}

                  {message.reply?.facts && message.reply.facts.length > 0 && (
                    <AssistantFacts
                      facts={message.reply.facts}
                      unit={view.workspace.unit}
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
                            className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-surface/90 p-3 shadow-xs transition-all hover:border-primary/50"
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

          {/* Quick chips bar */}
          <div className="shrink-0 flex items-center gap-2 overflow-x-auto px-4 py-2 border-t border-border/60 bg-canvas/40 scrollbar-none">
            <span className="text-xs text-muted shrink-0 flex items-center gap-1 font-medium">
              <SparkleIcon size={13} className="text-primary" />
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
                className="shrink-0 rounded-full border border-border/80 bg-surface px-3 py-1 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-primary-soft hover:text-primary active:scale-95"
              >
                {item.shortLabel}
              </button>
            ))}
          </div>

          {/* Form input controls (Telegram-style inline button positioning) */}
          <div className="border-t border-border bg-surface p-3 sm:p-4 rounded-b-3xl">
            <Form
              ref={form}
              onSubmit={(event) => {
                event.preventDefault();
                view.send();
              }}
              className="space-y-2"
            >
              {(view.voice.phase !== "idle" || view.voice.error) && (
                <div className="rounded-2xl border border-border/80 bg-canvas/80 p-3 shadow-xs backdrop-blur-sm">
                  <AssistantVoiceControls voice={view.voice} />
                </div>
              )}

              <div className="flex items-end gap-2 rounded-2xl border border-border/80 bg-canvas/60 p-1.5 sm:p-2 shadow-xs transition-colors focus-within:border-primary/50 focus-within:bg-surface focus-within:ring-2 focus-within:ring-primary/10">
                {/* 1. Attachment / Options (Start - Right in RTL) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={view.busy || !view.workspace.company}
                      className="size-11 shrink-0 rounded-full p-0 text-muted hover:bg-surface hover:text-foreground active:scale-95"
                      aria-label="امکانات و پرسش‌های پیشنهادی"
                    >
                      <PaperclipIcon size={19} className="scale-x-[-1]" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-80">
                    <DropdownMenuLabel className="flex items-center gap-1.5 font-medium text-foreground">
                      <SparkleIcon size={15} className="text-primary" aria-hidden />
                      <span>پرسش‌های پیشنهادی مالی</span>
                    </DropdownMenuLabel>
                    {suggestions.map((prompt) => (
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
                          <ArrowClockwiseIcon size={15} aria-hidden />
                          <span>گفت‌وگوی جدید (پاک‌سازی چت)</span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* 2. Text input (Center) */}
                <label htmlFor="assistant-view-message" className="sr-only">
                  پرسش شما از هوش مصنوعی
                </label>
                <Textarea
                  ref={input}
                  id="assistant-view-message"
                  value={view.draft}
                  onChange={(event) => view.setDraft(event.target.value)}
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
                  placeholder="پرسش شما…"
                  rows={1}
                  className="h-11 min-h-11 max-h-36 min-w-0 flex-1 resize-none border-0 bg-transparent px-2.5 py-2.5 text-xs sm:text-sm leading-6 shadow-none focus:border-0 focus:ring-0 focus-visible:ring-0 placeholder:text-muted"
                  aria-label="پرسش شما از هوش مصنوعی"
                  disabled={view.busy || !view.workspace.company || view.voice.phase === "recording"}
                />

                {/* 3. Action button (End - Left in RTL): Send when text exists, Voice when empty */}
                {view.draft.trim().length > 0 ? (
                  <Button
                    type="submit"
                    variant="primary"
                    busy={view.busy}
                    disabled={!view.draft.trim() || view.busy || !view.workspace.company}
                    aria-label="ارسال پرسش"
                    className="size-11 shrink-0 rounded-full p-0 shadow-action active:scale-95"
                  >
                    <span className="sr-only">ارسال پرسش</span>
                    <PaperPlaneTiltIcon
                      size={18}
                      className="scale-x-[-1] transition-transform duration-200"
                      aria-hidden
                    />
                  </Button>
                ) : (
                  <AssistantVoiceButton
                    voice={view.voice}
                    disabled={view.busy || !view.workspace.company}
                    className="size-11 shrink-0 rounded-full active:scale-95"
                  />
                )}
              </div>
            </Form>
          </div>
        </div>

      <Drawer
        title={evidence?.title || "شواهد مالی"}
        open={!!evidence}
        onOpenChange={(open) => {
          if (!open) setEvidence(null);
        }}
      >
        {evidence && <EvidenceList evidence={evidence.refs} />}
      </Drawer>
    </div>
  );
}
