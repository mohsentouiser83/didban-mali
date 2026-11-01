"use client";
import { api, setCsrf, type User } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function useLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User; csrf: string }>("/auth/login", {
        method: "POST",
        body: { email: email.trim(), password },
      });
      setCsrf(result.csrf);
      router.replace("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "ورود انجام نشد.");
    } finally {
      setBusy(false);
    }
  }
  return { email, setEmail, password, setPassword, busy, error, submit };
}
