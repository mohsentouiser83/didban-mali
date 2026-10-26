"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import { Toaster } from "./ui/sonner";
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: 0, refetchOnWindowFocus: true },
          mutations: { retry: false },
        },
      }),
  );
  useEffect(() => {
    const expire = () => {
      client.clear();
      window.location.replace("/login");
    };
    window.addEventListener("didban:session-expired", expire);
    return () => window.removeEventListener("didban:session-expired", expire);
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
