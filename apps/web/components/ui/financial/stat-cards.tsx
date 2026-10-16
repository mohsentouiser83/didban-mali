"use client";
import type { AppIcon } from "@/components/ui/icons";
import { MoneyDisplay } from "@/components/ui/financial/money-display";
import { StatCard } from "./stat-card";
export type StatCardItem = { title: string; value: string | null; currency?: string; icon: AppIcon; empty?: string; detail?: string };
export function StatCards({ items, loading = false }: { items: readonly StatCardItem[]; loading?: boolean }) {
  return <div data-slot="stat-cards" className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4 [&>div:nth-child(2)]:[animation-delay:35ms] [&>div:nth-child(3)]:[animation-delay:70ms] [&>div:nth-child(4)]:[animation-delay:105ms]" aria-busy={loading}>
    {items.map(({ title, value, currency = "", icon: Icon, empty = "—", detail }) => <StatCard key={title} title={title} detail={detail} loading={loading} valueKey={`${value}:${empty}`} icon={<Icon size={18} className="shrink-0 text-primary" aria-hidden="true" />} value={value !== null ? <MoneyDisplay wrap amount={value} currency={currency} direction="neutral" size="2xl" highlightZero /> : <strong className="text-sm font-normal">{empty}</strong>} />)}
  </div>;
}
