"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import {
  botProviderCards, shouldPollBotConnections,
  type BotConnection, type BotConnections, type BotPairing, type BotProvider,
} from "@/lib/bot-connections";
import { useWorkspace } from "./workspace";

interface Snapshot { scope: string; data?: BotConnections; error?: ApiError; loaded: boolean }
interface PendingAction { provider: BotProvider; kind: "create" | "confirm" | "revoke" }
interface CommandState { scope: string; busy: boolean; error?: ApiError; action?: PendingAction }
function createLifetime(scope: string) {
  let active = true;
  return { scope, active: () => active, activate: () => { active = true; }, cancel: () => { active = false; } };
}
function failure(error: unknown, fallback: string): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, fallback, "unknown");
}
export function useBotConnections() {
  const { company, user } = useWorkspace();
  const scopeKey = user?.id && company?.id ? `${user.id}:${company.id}` : "";
  const path = scopeKey ? `/companies/${company!.id}/bot-connections` : null;
  const lifetime = useMemo(() => createLifetime(scopeKey), [scopeKey]);
  const [snapshot, setSnapshot] = useState<Snapshot>({ scope: "", loaded: false });
  const [command, setCommand] = useState<CommandState>({ scope: "", busy: false });
  const [pairing, setPairing] = useState<{ scope: string; value: BotPairing }>();
  const [copied, setCopied] = useState<{ scope: string; provider: BotProvider }>();
  const [revision, setRevision] = useState(0);
  const [time, setTime] = useState(() => Date.now());
  const lock = useRef<object | null>(null);
  if (pairing && pairing.scope !== scopeKey) setPairing(undefined);
  if (copied && copied.scope !== scopeKey) setCopied(undefined);
  if (command.scope && command.scope !== scopeKey) setCommand({ scope: scopeKey, busy: false });
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    lifetime.activate();
    return () => { lifetime.cancel(); };
  }, [lifetime]);
  useEffect(() => {
    if (!path) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const data = await api<BotConnections>(path, { signal: abort.signal });
        if (abort.signal.aborted || !lifetime.active()) return;
        setSnapshot({ scope: lifetime.scope, data, loaded: true });
        setTime(Date.now());
        if (shouldPollBotConnections(data)) timer = setTimeout(load, 2500);
      } catch (error) {
        if (abort.signal.aborted || !lifetime.active()) return;
        setSnapshot({ scope: lifetime.scope, loaded: true, error: failure(error, "اتصال‌ها دریافت نشد.") });
      }
    };
    void load();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [path, lifetime, revision]);
  const current = snapshot.scope === scopeKey ? snapshot : undefined;
  const livePairing = pairing?.scope === scopeKey ? pairing.value : undefined;
  const liveCopied = copied?.scope === scopeKey ? copied.provider : undefined;
  const hasPending = shouldPollBotConnections(current?.data);
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasPending, scopeKey]);

  // useCommand's shared busy/error state has no account scope. Keep this
  // controller compatible while rejecting completions from an earlier identity.
  async function run(action: () => Promise<void>, target?: PendingAction) {
    if (!path || !lifetime.active() || lock.current === lifetime) return false;
    lock.current = lifetime;
    setCommand({ scope: scopeKey, busy: true, action: target });
    try { await action(); return lifetime.active(); }
    catch (error) {
      if (lifetime.active()) {
        setCommand({ scope: scopeKey, busy: false, error: failure(error, "عملیات انجام نشد.") });
        if (error instanceof ApiError && error.status === 409) refresh();
      }
      return false;
    } finally {
      if (lock.current === lifetime) lock.current = null;
      if (lifetime.active()) setCommand((previous) => ({ ...previous, busy: false }));
    }
  }
  async function create(provider: BotProvider) {
    return run(async () => {
      const value = await api<BotPairing>(path!, { method: "POST", body: { provider } });
      if (!lifetime.active()) return;
      setPairing({ scope: scopeKey, value });
      setCopied(undefined);
      setTime(Date.now());
      setSnapshot((previous) => ({ scope: scopeKey, loaded: true, data: {
        providers: previous.scope === scopeKey && previous.data ? previous.data.providers : {
          telegram: { configured: false }, bale: { configured: false },
        },
        items: [...(previous.scope === scopeKey ? previous.data?.items || [] : [])
          .filter((item) => !(item.provider === provider && ["pending", "awaiting_confirmation"].includes(item.state))), value],
      } }));
      refresh();
    }, { provider, kind: "create" });
  }
  async function copy(provider: BotProvider) {
    const card = botProviderCards(current?.data, livePairing, liveCopied, Date.now()).find((item) => item.provider === provider);
    if (!card?.pairingCommand) return;
    return run(async () => {
      if (!navigator.clipboard?.writeText) throw new ApiError(0, "کپی ممکن نشد؛ دستور را انتخاب و کپی کنید.", "clipboard_unavailable");
      try { await navigator.clipboard.writeText(card.pairingCommand!); }
      catch { throw new ApiError(0, "کپی ممکن نشد؛ دستور را انتخاب و کپی کنید.", "clipboard_denied"); }
      if (lifetime.active()) setCopied({ scope: scopeKey, provider });
    });
  }
  async function update(item: BotConnection, confirm: boolean) {
    if (!current?.data?.items.some((known) => known.id === item.id && known.version === item.version)) return false;
    return run(async () => {
      await api<BotConnection>(`${path}/${item.id}${confirm ? "/confirm" : ""}`, {
        method: confirm ? "POST" : "DELETE", version: item.version,
      });
      if (!lifetime.active()) return;
      setPairing(undefined);
      setCopied(undefined);
      refresh();
    }, { provider: item.provider, kind: confirm ? "confirm" : "revoke" });
  }
  return {
    scopeKey, company, cards: botProviderCards(current?.data, livePairing, liveCopied, time),
    loading: !!path && !current?.loaded, error: current?.error, refresh,
    busy: command.scope === scopeKey && command.busy,
    operationError: command.scope === scopeKey ? command.error : undefined,
    pendingAction: command.scope === scopeKey && command.busy ? command.action : undefined,
    clearError: () => setCommand((previous) => ({ ...previous, error: undefined })),
    create, copy, confirm: (item: BotConnection) => update(item, true),
    revoke: (item: BotConnection) => update(item, false),
  };
}
