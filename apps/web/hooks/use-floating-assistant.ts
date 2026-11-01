"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, type Manifest, type Metric } from "@/lib/api";
import { useWorkspace } from "./workspace";
import { useAssistantVoice } from "./use-assistant-voice";
export interface AssistantReply {
  answer?: string;
  explanation?: string;
  facts?: Metric[];
  evidence_refs?: string[];
  manifest_id?: string | null;
  as_of_date?: string;
  mode?: "facts" | "model_facts" | "chat";
  model_state?: string;
  model_reason?: string;
}
export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
  error?: string;
  reply?: AssistantReply;
}
interface Intent {
  replyId: string;
  question: string;
  key: string;
  manifestId?: string | null;
  history: { role: "user" | "assistant"; text: string }[];
}
export function useFloatingAssistant() {
  const workspace = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const currentAbort = useRef<AbortController | null>(null);
  const intents = useRef(new Map<string, Intent>());
  useEffect(() => () => currentAbort.current?.abort(), []);
  const execute = async (intent: Intent) => {
    if (lock.current || !workspace.company) return;
    lock.current = true;
    setBusy(true);
    const abort = new AbortController();
    currentAbort.current = abort;
    setMessages((previous) =>
      previous.map((message) =>
        message.id === intent.replyId
          ? { ...message, pending: true, error: undefined }
          : message,
      ),
    );
    try {
      if (intent.manifestId === undefined) {
        try {
          const manifest = await api<Manifest>(
            workspace.companyPath("results/latest?view=summary")!,
            { signal: abort.signal },
          );
          intent.manifestId = manifest.id;
        } catch (error) {
          if (error instanceof ApiError && error.status === 404)
            intent.manifestId = null;
          else throw error;
        }
      }
      const reply = await api<AssistantReply>(
        workspace.companyPath("assistant/questions")!,
        {
          method: "POST",
          body: {
            manifest_id: intent.manifestId ?? null,
            question: intent.question,
            history: intent.history,
          },
          key: intent.key,
          signal: abort.signal,
        },
      );
      if (!abort.signal.aborted)
        setMessages((previous) =>
          previous.map((message) =>
            message.id === intent.replyId
              ? {
                  ...message,
                  pending: false,
                  text: reply.answer || reply.explanation || "",
                  reply,
                }
              : message,
          ),
        );
    } catch (error) {
      if (abort.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) {
        setMessages([]);
        intents.current.clear();
        setOpen(false);
        router.replace("/login");
        return;
      }
      setMessages((previous) =>
        previous.map((message) =>
          message.id === intent.replyId
            ? {
                ...message,
                pending: false,
                error:
                  error instanceof ApiError && error.status === 404
                    ? "گزارشی برای این شرکت موجود نیست."
                    : error instanceof Error
                      ? error.message
                      : "پاسخ دریافت نشد.",
              }
            : message,
        ),
      );
    } finally {
      if (!abort.signal.aborted) {
        setBusy(false);
        lock.current = false;
      }
    }
  };
  const voice = useAssistantVoice({
    path: workspace.companyPath("assistant/transcriptions"),
    active: open && !!workspace.company,
    onTranscript: (text) => setDraft((previous) => previous.trim() ? `${previous}\n${text}` : text),
    onSessionExpired: () => {
      setMessages([]);
      intents.current.clear();
      setDraft("");
      setOpen(false);
      router.replace("/login");
    },
  });
  const send = () => {
    const question = draft.trim();
    if (lock.current || !question || busy || !workspace.company || voice.phase !== "idle") return;
    const replyId = crypto.randomUUID();
    const intent: Intent = {
      replyId, question, key: crypto.randomUUID(),
      history: messages.filter((message) => !message.pending && !message.error && message.text.trim())
        .slice(-12).map(({ role, text }) => ({ role, text: text.slice(0, 12000) })),
    };
    intents.current.set(replyId, intent);
    setMessages((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: "user", text: question },
      { id: replyId, role: "assistant", text: "", pending: true },
    ]);
    setDraft("");
    void execute(intent);
  };
  const retry = (id: string) => {
    const intent = intents.current.get(id);
    if (intent) void execute(intent);
  };
  return {
    workspace,
    open,
    setOpen: (next: boolean) => {
      if (!next) voice.cancel();
      setOpen(next);
    },
    draft,
    setDraft,
    messages,
    busy,
    send,
    retry,
    voice,
  };
}
