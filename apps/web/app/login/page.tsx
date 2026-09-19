import type { Metadata } from "next";

import { AuthScreen } from "@/components/product/auth-screen";

export const metadata: Metadata = {
  title: "ورود | دیدبان مالی",
  description: "ورود به سامانه عملیات و کنترل مالی دیدبان مالی",
};

export default function LoginPage() {
  return <AuthScreen initialMode="login" />;
}
