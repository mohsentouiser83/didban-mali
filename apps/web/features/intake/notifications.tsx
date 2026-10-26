"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { NotificationsView } from "./notifications-view";
import { api, message } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
export function CompanyNotifications({ company }: { company: string }) {
  const [open, setOpen] = useState(false),
    cache = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", company],
    queryFn: ({ signal }) =>
      api.get<Schema<"NotificationPage">>(
        `/api/v1/companies/${company}/notifications?limit=100`,
        signal,
      ),
    refetchInterval: 5000,
  });
  const read = useCommand<Schema<"Notification">, Schema<"Notification">>(
    (item, key) =>
      api.mutate(
        `/api/v1/companies/${company}/notifications/${item.id}`,
        "PATCH",
        { read: true },
        key,
        item.version,
      ),
    async () => {
      await cache.invalidateQueries({ queryKey: ["notifications", company] });
    },
  );
  const pending = query.data?.items.filter((i) => !i.read_at).length ?? 0;
  return (
    <NotificationsView
      company={company}
      open={open}
      setOpen={setOpen}
      pending={pending}
      items={query.data?.items ?? []}
      error={query.error ? message(query.error) : undefined}
      loading={query.isPending}
      onRetry={() => {
        void query.refetch();
      }}
      reading={read.isPending}
      onRead={(item) => read.mutate(item)}
      readError={read.error ? message(read.error) : undefined}
    />
  );
}
