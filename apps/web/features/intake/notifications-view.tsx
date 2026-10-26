"use client";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import type { Schema } from "@didban/api-client";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import {
  ErrorState,
  StatusMessage,
  LoadingState,
} from "@/components/ui/states";
export function NotificationsView({
  company,
  open,
  setOpen,
  pending,
  items,
  error,
  loading,
  onRetry,
  reading,
  onRead,
  readError,
}: {
  company: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  pending: number;
  items: Schema<"Notification">[];
  error?: string;
  loading: boolean;
  onRetry: () => void;
  reading: boolean;
  onRead: (item: Schema<"Notification">) => void;
  readError?: string;
}) {
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button
          variant="ghost"
          aria-label={
            pending
              ? `اعلان‌ها؛ ${new Intl.NumberFormat("fa-IR").format(pending)} خوانده‌نشده`
              : "اعلان‌ها"
          }
        >
          <Bell size={18} aria-hidden />
          {pending ? (
            <span className="size-2 rounded-full bg-primary" aria-hidden />
          ) : null}
        </Button>
      }
    >
      <section className="w-72 max-w-full space-y-3">
        <h2 className="font-medium">اعلان‌های شرکت</h2>
        {error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : loading ? (
          <LoadingState layout="compact" />
        ) : items.length ? (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 rounded-control border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  {item.session_id ? (
                    <Link
                      href={`/companies/${company}/uploads/${item.session_id}`}
                      onClick={() => setOpen(false)}
                      className="text-sm text-primary hover:underline"
                    >
                      {item.title_fa}
                    </Link>
                  ) : (
                    <p>{item.title_fa}</p>
                  )}
                </div>
                {!item.read_at ? (
                  <Button
                    variant="ghost"
                    className="px-2"
                    aria-label="علامت خوانده‌شده"
                    disabled={reading}
                    onClick={() => onRead(item)}
                  >
                    <Check size={16} />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <StatusMessage>اعلانی ندارید.</StatusMessage>
        )}
        {readError ? <ErrorState message={readError} /> : null}
      </section>
    </Popover>
  );
}
