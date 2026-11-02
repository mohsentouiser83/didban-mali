"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, type Metric } from "@/lib/api";
import { useWorkspace } from "./workspace";
import { useAssistantVoice } from "./use-assistant-voice";
export interface AssistantReply {
  answer?: string;
  explanation?: string;
  facts?: Metric[];
  evidence_refs?: string[];
  manifest_id?: string | null;
  native_statement_id?: string | null;
  context_type?: "imported_manifest" | "native_statement";
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
export interface AssistantContext {
  context_type: "imported_manifest" | "native_statement";
  manifest_id: string | null;
  native_statement_id: string | null;
  available: boolean;
  reason_code?: string | null;
  action?: string | null;
}
interface Intent {
  replyId: string;
  question: string;
  key: string;
  context?: AssistantContext;
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
      if (intent.context === undefined) {
        intent.context = await api<AssistantContext>(
          workspace.companyPath("assistant/context")!, { signal: abort.signal });
      }
      const reply = await api<AssistantReply>(
        workspace.companyPath("assistant/questions")!,
        {
          method: "POST",
          body: {
            context_type: intent.context.context_type,
            manifest_id: intent.context.manifest_id,
            native_statement_id: intent.context.native_statement_id,
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
                  error instanceof Error ? error.message : "پاسخ دریافت نشد.",
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
