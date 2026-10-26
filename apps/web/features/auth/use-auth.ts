"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { Schema } from "@didban/api-client";
import { api } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
export function useCurrentUser() {
  return useQuery({
    queryKey: ["me"],
    queryFn: ({ signal }) => api.get<Schema<"User">>("/api/v1/auth/me", signal),
  });
}
export function useLogin() {
  const router = useRouter(),
    cache = useQueryClient();
  return useCommand<Schema<"LoginRequest">, Schema<"User">>(
    async (input, key) => {
      const user = await api.mutate<Schema<"User">>(
        "/api/v1/auth/login",
        "POST",
        input,
        key,
        undefined,
        false,
      );
      api.reset();
      return user;
    },
    (user) => {
      cache.clear();
      cache.setQueryData(["me"], user);
      router.replace("/companies");
    },
  );
}
export function useLogout() {
  const router = useRouter(),
    cache = useQueryClient();
  return useCommand<void, Schema<"Success">>(
    (_, key) => api.mutate("/api/v1/auth/logout", "POST", undefined, key),
    () => {
      api.reset();
      cache.clear();
      router.replace("/login");
    },
  );
}
export function useActivate(mode: "invite" | "reset") {
  return useCommand<Schema<"TokenPasswordRequest">, unknown>(
    (input, key) =>
      api.mutate(
        `/api/v1/auth/${mode === "invite" ? "accept-invitation" : "reset-password"}`,
        "POST",
        input,
        key,
        undefined,
        false,
      ),
    () => {
      api.reset();
    },
  );
}
