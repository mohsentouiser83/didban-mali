export type BotProvider = "telegram" | "bale";
export type BotConnectionState = "pending" | "awaiting_confirmation" | "active" | "revoked";
export interface BotConnection {
  id: string;
  provider: BotProvider;
  state: BotConnectionState;
  version: number;
  created_at: string;
  expires_at: string;
  sender_id: string | null;
  chat_id: string | null;
}
export interface BotConnections {
  providers: Record<BotProvider, { configured: boolean; username?: string | null }>;
  items: BotConnection[];
}
export interface BotPairing extends BotConnection { pairing_code: string | null }
export interface BotProviderCard {
  provider: BotProvider;
  label: string;
  configured: boolean;
  username?: string | null;
  active?: BotConnection;
  pending?: BotConnection;
  expired: boolean;
  remainingSeconds: number;
  remainingMinutes: number;
  pairingCommand?: string;
  botUrl?: string;
  copied: boolean;
}
export const BOT_PROVIDERS: BotProvider[] = ["telegram", "bale"];
export function pairingRemaining(item: BotConnection, time: number): number {
  const expires = Date.parse(item.expires_at);
  return Number.isFinite(expires) ? Math.max(0, Math.ceil((expires - time) / 1000)) : 0;
}
export function shouldPollBotConnections(data: BotConnections | undefined): boolean {
  return !!data?.items.some((item) =>
    (item.state === "pending" || item.state === "awaiting_confirmation") && pairingRemaining(item, Date.now()) > 0,
  );
}
export function botProviderCards(
  data: BotConnections | undefined,
  pairing: BotPairing | undefined,
  copied: BotProvider | undefined,
  time: number,
): BotProviderCard[] {
  return BOT_PROVIDERS.map((provider) => {
    const items = (data?.items || []).filter((item) => item.provider === provider)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const active = items.find((item) => item.state === "active");
    const pending = items.find((item) => item.state === "pending" || item.state === "awaiting_confirmation");
    const remainingSeconds = pending ? pairingRemaining(pending, time) : 0;
    const code = pending?.id === pairing?.id && pending?.state === "pending" && remainingSeconds > 0
      ? pairing?.pairing_code : undefined;
    const username = data?.providers[provider]?.username;
    const safeUsername = username && /^[A-Za-z0-9_]{3,64}$/.test(username) ? username : undefined;
    return {
      provider, label: provider === "telegram" ? "تلگرام" : "بله",
      configured: data?.providers[provider]?.configured === true,
      username: safeUsername, active, pending,
      expired: !!pending && remainingSeconds === 0, remainingSeconds,
      remainingMinutes: Math.ceil(remainingSeconds / 60),
      pairingCommand: code ? `/start ${code}` : undefined,
      botUrl: code && safeUsername
        ? `https://${provider === "telegram" ? "t.me" : "ble.ir"}/${safeUsername}?start=${encodeURIComponent(code)}` : undefined,
      copied: copied === provider && !!code,
    };
  });
}
