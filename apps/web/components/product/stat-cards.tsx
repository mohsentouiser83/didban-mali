"use client";

import type { AppIcon } from "@/components/ui/icons";
import { MoneyDisplay } from "@/components/ui/financial/money-display";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./stat-cards.module.css";

export type StatCardItem = {
  title: string;
  value: string | null;
  currency?: string;
  icon: AppIcon;
  empty?: string;
};

export function StatCards({ items, loading = false }: { items: readonly StatCardItem[]; loading?: boolean }) {
  return <div className={styles.cards} aria-busy={loading}>
    {items.map(({ title, value, currency = "", icon: Icon, empty = "—" }) => (
      <article key={title} className={styles.card} aria-label={title}>
        <div className={styles.cardHeading}><h3>{title}</h3><span className={styles.icon}><Icon size={20} aria-hidden="true" /></span></div>
        {loading ? <Skeleton className="h-10 w-3/4" /> :
          <div className={`${styles.value} ${value !== null && Number(value) < 0 ? styles.negative : ""}`}>
            {value !== null ? <MoneyDisplay amount={value} currency={currency} direction="neutral" size="2xl" highlightZero /> : <strong className={styles.unavailable}>{empty}</strong>}
          </div>}
      </article>
    ))}
  </div>;
}
