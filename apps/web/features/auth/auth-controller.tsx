"use client";
import { useLogin, useActivate } from "./use-auth";
import { LoginView, ActivationView } from "./auth-view";
import { message } from "@/lib/api";
export function LoginController() {
  const action = useLogin();
  return (
    <LoginView
      busy={action.isPending}
      error={action.error ? message(action.error) : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        action.mutate({
          email: String(f.get("email")).trim(),
          password: String(f.get("password")),
        });
      }}
    />
  );
}
export function ActivationController({ mode }: { mode: "invite" | "reset" }) {
  const action = useActivate(mode);
  return (
    <ActivationView
      mode={mode}
      busy={action.isPending}
      done={action.isSuccess}
      error={action.error ? message(action.error) : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        action.mutate({
          token: String(f.get("token")).trim(),
          new_password: String(f.get("new_password")),
        });
      }}
    />
  );
}
