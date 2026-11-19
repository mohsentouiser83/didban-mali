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
  ShieldCheckIcon,
  ChatCircleDotsIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
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

const suggestions = [
  "مانده نقدینگی و وضعیت حساب‌ها چقدر است؟",
  "بزرگ‌ترین مطالبات معوق و اشخاص بدهکار کیستند؟",
  "خلاصه سود، زیان و هزینه‌های این دوره را بگو.",
  "آیا مغایرت یا بررسی ضروری در اسناد وجود دارد؟",
];

export function AssistantView() {
  const view = useFloatingAssistant({ defaultOpen: true });
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [evidence, setEvidence] = useState<{
    title: string;
    refs: string[];
  } | null>(null);

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
    end.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [view.messages]);

  if (!view.workspace.company) return <NoCompany />;

  return (
    <>
      <PageHeader
        icon={SparkleIcon}
        title="هوش مصنوعی"
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

      <div className="flex flex-col gap-6">
        {/* Safety & Context banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-surface px-5 py-3.5 shadow-xs">
          <div className="flex items-center gap-2.5 text-xs text-muted">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">
              <ShieldCheckIcon size={15} weight="duotone" aria-hidden />
            </span>
            <span>
              تحلیل و پاسخ به پرسش‌ها بر مبنای اسناد و صورت‌های مالی تأییدشده •{" "}
              <strong className="font-medium text-foreground">فقط‌خواندنی</strong>
            </span>
          </div>
          <span className="rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium text-foreground">
            {view.workspace.company.name}
          </span>
        </div>

        {/* Chat log & workspace */}
        <div className="flex min-h-[460px] flex-col rounded-3xl border border-border bg-surface shadow-xs">
          <div
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
                <h3 className="font-display text-lg font-medium text-foreground">
                  دستیار هوش مصنوعی دیدبان
                </h3>
                <p className="mt-2 max-w-md text-xs leading-6 text-muted">
                  پرسش خود را درباره نقدینگی، مغایرت‌های بانکی، بدهی‌ها، مطالبات
                  و شواهد مالی مطرح کنید یا از پرسش‌های پیشنهادی زیر استفاده کنید.
                </p>

                <div className="mt-8 flex max-w-xl flex-wrap justify-center gap-2">
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

          {/* Form input controls */}
          <div className="border-t border-border bg-surface p-4 sm:p-5 rounded-b-3xl">
            <Form
              ref={form}
              onSubmit={(event) => {
                event.preventDefault();
                view.send();
              }}
              className="space-y-3"
            >
              <div className="relative">
                <Textarea
                  ref={input}
                  value={view.draft}
                  onChange={(event) => view.setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      view.send();
                    }
                  }}
                  placeholder="پرسش خود را درباره وضعیت مالی مطرح کنید (Enter برای ارسال، Shift+Enter خط بعد)..."
                  className="min-h-24 pe-12 ps-4 text-xs sm:text-sm leading-6 resize-none rounded-2xl"
                  aria-label="پرسش شما از هوش مصنوعی"
                  disabled={view.busy}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AssistantVoiceButton
                    voice={view.voice}
                    disabled={view.busy || !view.workspace.company}
                  />
                  <AssistantVoiceControls voice={view.voice} />
                </div>
                <Button
                  type="submit"
                  busy={view.busy}
                  disabled={!view.draft.trim() || view.busy}
                  className="gap-2 px-4"
                >
                  <span>ارسال پرسش</span>
                  <PaperPlaneTiltIcon
                    size={16}
                    className="scale-x-[-1] transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Button>
              </div>
            </Form>
          </div>
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
    </>
  );
}
